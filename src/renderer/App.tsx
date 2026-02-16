import React, { useEffect, useState, useRef } from 'react';
import { WaveformVisualizer } from './components/VoiceInterface/WaveformVisualizer';
import { useAutoVoiceRecording } from './hooks/useAutoVoiceRecording';
import { sendChatMessageStream, synthesizeSpeech, type ChatMessage, type StreamEvent, type VoiceOptions } from './services/api';

interface PerformanceMetrics {
  ttft?: number; // Time to First Token
  firstAudioStart?: number; // Time until first audio plays
  totalTime?: number;
  sentenceCount?: number;
  tokensPerSecond?: number;
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface SearchResultData {
  query: string;
  results: SearchResult[];
  message?: string;
  timestamp: number;
}

interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'timing' | 'tts' | 'stream' | 'queue';
  message: string;
  icon: string;
  color: string;
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | null>(null);
  const [showMetrics, setShowMetrics] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceOptions>({
    voice: 'nova',
    speed: 1.0,
    model: 'tts-1-hd',
  });
  const voiceSettingsRef = useRef<VoiceOptions>({ voice: 'nova', speed: 1.0, model: 'tts-1-hd' });
  const [searchResults, setSearchResults] = useState<SearchResultData | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const logIdRef = useRef(0);
  // Ordered TTS: store results by sentence index, play in order
  const ttsResultsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const nextPlayIndexRef = useRef(1); // sentence indices start at 1
  // Voice buffering during AI speech
  const pendingTranscriptsRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  // AbortController for cancelling in-flight streaming requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const iconMap = {
      info: '📝',
      success: '✅',
      error: '❌',
      timing: '⏱️',
      tts: '🎤',
      stream: '💬',
      queue: '▶️'
    };

    const colorMap = {
      info: 'text-orange-400',
      success: 'text-green-400',
      error: 'text-red-400',
      timing: 'text-orange-500',
      tts: 'text-orange-600',
      stream: 'text-orange-400',
      queue: 'text-orange-300'
    };

    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    const log: LogEntry = {
      id: logIdRef.current++,
      timestamp,
      type,
      message,
      icon: iconMap[type],
      color: colorMap[type]
    };

    setLogs(prev => {
      const newLogs = [...prev, log];
      // Keep last 100 logs
      if (newLogs.length > 100) {
        return newLogs.slice(-100);
      }
      return newLogs;
    });

    // Also log to console
    console.log(`${log.icon} [${timestamp}] ${message}`);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollLogsToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    scrollLogsToBottom();
  }, [logs]);

  // Filter out nonsensical transcripts (breathing, noise, Whisper hallucinations)
  const isValidTranscript = (text: string): boolean => {
    const cleaned = text.trim().toLowerCase().replace(/[.,!?;:'"…\-]/g, '');
    // Too short
    if (cleaned.length < 2) return false;
    // Known Whisper hallucinations from silence/breathing/noise
    const hallucinations = new Set([
      'you', 'the', 'a', 'i', 'um', 'uh', 'hmm', 'hm', 'ah', 'oh',
      'thank you', 'thanks', 'thanks for watching', 'thank you for watching',
      'bye', 'goodbye', 'see you', 'see you next time',
      'subscribe', 'like and subscribe',
      'music', 'applause', 'laughter',
      'so', 'and', 'but', 'or', 'the end',
      'silence', 'inaudible',
      // Whisper context hallucinations
      'the session begins', 'session begins',
      'the ai is talking to the speaker',
      'the speaker is talking to the ai',
      'the conversation begins', 'conversation begins',
      'the conversation continues', 'conversation continues',
      'the speaker is talking', 'the speaker begins',
      'end of transcript', 'transcript ends',
      'recording starts', 'recording begins',
      // Whisper subtitle/media hallucinations
      'subtitles by', 'translated by', 'captioned by',
      'copyright', 'all rights reserved',
      // Breathing/noise
      'sst', 'psst', 'shh', 'ssh', 'sss', 'tsk', 'tch',
      'mm', 'mmm', 'mhm', 'ugh',
    ]);
    if (hallucinations.has(cleaned)) return false;
    // Single word under 4 chars is likely noise
    if (!cleaned.includes(' ') && cleaned.length < 4) return false;
    // Detect repetitive word patterns (e.g., "psst psst psst psst")
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
      const uniqueWords = new Set(words);
      // If 80%+ of words are the same word, it's repetitive noise
      if (uniqueWords.size === 1 && words.length >= 2) return false;
      if (uniqueWords.size <= 2 && words.length >= 4) return false;
    }
    return true;
  };

  // Initialize AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const playAudio = async (base64Audio: string) => {
    try {
      setIsSpeaking(true);
      console.log('🔊 Starting TTS playback...');

      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data
      const audioContext = audioContextRef.current!;
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);

      // Play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        console.log('🔊 TTS playback complete');
        setIsSpeaking(false);
      };

      source.start(0);
      console.log('🔊 TTS playback started');
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
    }
  };

  const playNextInQueue = async () => {
    if (isPlayingRef.current) {
      addLog('Already playing, skipping', 'queue');
      return;
    }

    if (audioQueueRef.current.length === 0) {
      addLog('Queue empty', 'queue');
      return;
    }

    // Resume AudioContext if suspended (fixes autoplay policy issues)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        addLog('AudioContext resumed', 'info');
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const audio = audioQueueRef.current.shift()!;
    currentAudioRef.current = audio; // Store reference to currently playing audio
    addLog(`Playing audio (${audioQueueRef.current.length} remaining in queue), src: ${audio.src.substring(0, 50)}...`, 'queue');

    return new Promise<void>((resolve) => {
      audio.onended = () => {
        addLog('Audio finished playing', 'success');
        isPlayingRef.current = false;
        currentAudioRef.current = null; // Clear reference
        // Clean up blob URL
        URL.revokeObjectURL(audio.src);
        // Play next in queue
        if (audioQueueRef.current.length > 0) {
          addLog(`Playing next (${audioQueueRef.current.length} remaining)`, 'queue');
          playNextInQueue();
        } else {
          addLog('Queue complete - all audio played', 'success');
          setIsSpeaking(false);
          // Voice listening stays active - buffered transcripts will be processed
          // via the isSpeaking useEffect when setIsSpeaking(false) triggers
        }
        resolve();
      };

      audio.onerror = (e: any) => {
        const errorMsg = e.target?.error ? `${e.target.error.code}: ${e.target.error.message}` : 'Unknown error';
        addLog(`Audio playback error: ${errorMsg}`, 'error');
        console.error('Audio error details:', e);
        isPlayingRef.current = false;
        currentAudioRef.current = null; // Clear reference
        setIsSpeaking(false);
        // DON'T revoke URL here - it might prevent retries
        // Will be cleaned up later
        resolve();
      };

      audio.onloadeddata = () => {
        addLog(`Audio data loaded, duration: ${audio.duration}s`, 'success');
      };

      audio.play().then(() => {
        addLog('Audio.play() succeeded, now playing', 'success');
      }).catch((err) => {
        addLog(`Audio.play() failed: ${err.message}`, 'error');
        console.error('Play error:', err);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        // DON'T revoke URL on play error - might just need user interaction
        resolve();
      });
    });
  };

  // Flush ordered TTS results into the playback queue in correct order
  const flushOrderedTTS = () => {
    while (ttsResultsRef.current.has(nextPlayIndexRef.current)) {
      const audio = ttsResultsRef.current.get(nextPlayIndexRef.current)!;
      ttsResultsRef.current.delete(nextPlayIndexRef.current);
      audioQueueRef.current.push(audio);
      addLog(`[TTS ${nextPlayIndexRef.current}] Flushed to playback queue (${audioQueueRef.current.length} in queue)`, 'queue');
      nextPlayIndexRef.current++;
    }

    // Start playing if not already playing and queue has items
    if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
      playNextInQueue();
    }
  };

  const enqueueTTS = async (text: string, index: number, requestStart: number) => {
    const ttsStart = Date.now();
    addLog(`[TTS ${index}] Starting synthesis: "${text.substring(0, 40)}..."`, 'tts');

    try {
      const result = await synthesizeSpeech(text, false, voiceSettingsRef.current);

      if (result.success && result.audioData) {
        const ttsTime = Date.now() - ttsStart;
        addLog(`[TTS ${index}] Synthesized in ${ttsTime}ms, format: ${result.format}`, 'success');

        // Decode base64 to binary
        const binaryString = atob(result.audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Determine correct MIME type
        let mimeType = 'audio/mpeg';
        if (result.format === 'wav') {
          mimeType = 'audio/wav';
        } else if (result.format === 'mp3') {
          mimeType = 'audio/mpeg';
        }

        // Create blob from binary data
        const blob = new Blob([bytes], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        addLog(`[TTS ${index}] Created blob: ${blob.size} bytes, type: ${mimeType}`, 'tts');

        // Create audio element
        const audio = new Audio(blobUrl);
        audio.preload = 'auto';

        addLog(`[TTS ${index}] Audio element created, storing for ordered playback`, 'tts');

        // Store at the correct index position for ordered playback
        ttsResultsRef.current.set(index, audio);

        // If first sentence, record metric
        if (index === 1 && !currentMetrics?.firstAudioStart) {
          const firstAudioTime = Date.now() - requestStart;
          addLog(`First audio ready: ${firstAudioTime}ms from request start`, 'timing');
          setCurrentMetrics(prev => ({
            ...prev,
            firstAudioStart: firstAudioTime
          }));
        }

        // Flush any consecutive ready results into the playback queue
        flushOrderedTTS();
      }
    } catch (error: any) {
      addLog(`[TTS ${index}] Error: ${error.message}`, 'error');
      // On error, skip this index so we don't block subsequent sentences
      if (!ttsResultsRef.current.has(index)) {
        nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, index + 1);
        flushOrderedTTS();
      }
    }
  };

  const stopCurrentAudio = () => {
    // Stop currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      URL.revokeObjectURL(currentAudioRef.current.src);
      currentAudioRef.current = null;
      addLog('Stopped currently playing audio', 'info');
    }

    // Clear queued audio
    if (audioQueueRef.current.length > 0) {
      audioQueueRef.current.forEach(audio => {
        URL.revokeObjectURL(audio.src);
      });
      audioQueueRef.current = [];
      addLog('Cleared audio queue', 'info');
    }

    // Clear pending ordered TTS results
    ttsResultsRef.current.forEach(audio => {
      URL.revokeObjectURL(audio.src);
    });
    ttsResultsRef.current.clear();
    nextPlayIndexRef.current = 1;

    isPlayingRef.current = false;
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  };

  const getAIResponseStreaming = async (userText: string, currentMessages: ChatMessage[]) => {
    // Interrupt any ongoing audio playback
    stopCurrentAudio();

    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset ordered TTS state for new request
    ttsResultsRef.current.clear();
    nextPlayIndexRef.current = 1;

    // Clear previous search results
    setSearchResults(null);

    const requestStart = Date.now();
    setIsThinking(true);
    isSpeakingRef.current = false;
    setCurrentMetrics({});

    let fullResponse = '';
    let assistantMessageIndex = -1;

    addLog('Starting streaming request', 'stream');

    try {
      await sendChatMessageStream(userText, currentMessages, async (event: StreamEvent) => {
        if (event.type === 'timing') {
          addLog(`${event.stage}: ${event.elapsed}ms${event.metric ? ` (${event.metric})` : ''}`, 'timing');

          if (event.stage === 'first_token') {
            setCurrentMetrics(prev => ({
              ...prev,
              ttft: event.elapsed
            }));
          }
        } else if (event.type === 'search_results') {
          // Handle search results from web search
          console.log('📥 Received search_results event:', event);
          addLog(`Web search: "${event.query}" - ${event.results?.length || 0} results`, 'info');
          const searchData = {
            query: event.query!,
            results: event.results || [],
            message: event.message,
            timestamp: event.timestamp || Date.now()
          };
          console.log('Setting search results state:', searchData);
          setSearchResults(searchData);
        } else if (event.type === 'token') {
          // Update UI with partial text (optional - for typing effect)
          fullResponse += event.text;
        } else if (event.type === 'sentence' && event.text) {
          fullResponse += event.text + ' ';

          addLog(`[SENTENCE ${event.index}] Received: "${event.text.substring(0, 40)}..."`, 'stream');

          // Add/update message in UI
          if (assistantMessageIndex === -1) {
            // First sentence - create new message
            const msg: ChatMessage = { role: 'assistant', content: event.text };
            setMessages(prev => {
              assistantMessageIndex = prev.length;
              return [...prev, msg];
            });
          } else {
            // Update existing message
            setMessages(prev => {
              const updated = [...prev];
              updated[assistantMessageIndex] = {
                ...updated[assistantMessageIndex],
                content: fullResponse.trim()
              };
              return updated;
            });
          }

          // Queue TTS for this sentence (parallel to next sentence generation)
          enqueueTTS(event.text, event.index!, requestStart);
        } else if (event.type === 'done') {
          addLog('Stream complete!', 'success');
          addLog(`Metrics: Total ${event.metrics?.totalTime}ms, TTFT ${event.metrics?.ttft}ms`, 'timing');

          setCurrentMetrics(prev => ({
            ...prev,
            totalTime: event.metrics?.totalTime,
            sentenceCount: event.sentenceCount,
            tokensPerSecond: event.metrics?.tokensPerSecond
          }));

          setIsThinking(false);

          // Final message update
          if (assistantMessageIndex >= 0 && event.fullResponse) {
            setMessages(prev => {
              const updated = [...prev];
              updated[assistantMessageIndex] = {
                ...updated[assistantMessageIndex],
                content: event.fullResponse!
              };
              return updated;
            });
          }
        } else if (event.type === 'error') {
          addLog(`Stream error: ${event.error}`, 'error');
          setIsThinking(false);
          const errorMessage: ChatMessage = {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.'
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }, controller.signal);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        addLog('Request aborted by user', 'info');
      } else {
        addLog(`Fatal error: ${error.message}`, 'error');
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      setIsThinking(false);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleStopAll = () => {
    addLog('STOP ALL triggered', 'info');

    // 1. Abort any in-flight streaming request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Stop all audio playback and clear queues
    stopCurrentAudio();

    // 3. Stop listening
    setManualStop(true);
    manualStopRef.current = true;
    stopListening();

    // 4. Clear buffered transcripts
    pendingTranscriptsRef.current = [];

    // 5. Reset thinking state
    setIsThinking(false);

    addLog('All systems stopped', 'success');
  };

  const handleVoiceTranscript = async (text: string) => {
    addLog(`Voice transcript received: "${text}"`, 'info');

    // Filter out nonsensical transcripts (breathing, noise, hallucinations)
    if (!isValidTranscript(text)) {
      addLog(`Filtered out noise transcript: "${text}"`, 'info');
      return;
    }

    // If AI is currently speaking, buffer the transcript for later
    if (isSpeakingRef.current) {
      addLog(`Buffered transcript during speech: "${text}"`, 'info');
      pendingTranscriptsRef.current.push(text);
      return;
    }

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      // Get AI response with streaming (pass current messages before adding user message)
      getAIResponseStreaming(text, prev);
      return newMessages;
    });
  };

  const [manualStop, setManualStop] = useState(false);
  const manualStopRef = useRef(false);

  const { isListening, isRecording, isProcessing, volume, startListening, stopListening } =
    useAutoVoiceRecording({
      onTranscript: handleVoiceTranscript,
      silenceThreshold: 0.15, // Higher = requires louder speech (filters out whispers/breathing)
      silenceDuration: 1200, // Faster cutoff - 1.2s silence = more responsive
      minRecordingDuration: 600, // Minimum recording length to filter noise
    });

  const handleStopListening = () => {
    setManualStop(true);
    manualStopRef.current = true;
    stopListening();
  };

  const handleStartListening = async () => {
    // Resume AudioContext on user interaction (fixes autoplay policy)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        addLog('AudioContext resumed on user interaction', 'info');
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }

    setManualStop(false);
    manualStopRef.current = false;
    startListening();
  };

  useEffect(() => {
    // Only auto-start listening after user has clicked "Start Session"
    if (sessionStarted && !manualStop) {
      startListening();
    }
    return () => stopListening();
  }, [sessionStarted]);

  // Track speaking state in ref and process buffered transcripts when done
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;

    if (!isSpeaking && pendingTranscriptsRef.current.length > 0) {
      // AI finished speaking - check buffered transcripts
      const buffered = pendingTranscriptsRef.current.join(' ').trim();
      pendingTranscriptsRef.current = [];

      if (isValidTranscript(buffered)) {
        addLog(`Processing buffered transcript: "${buffered}"`, 'info');
        // Send as a new message
        const userMessage: ChatMessage = { role: 'user', content: buffered };
        setMessages(prev => {
          getAIResponseStreaming(buffered, prev);
          return [...prev, userMessage];
        });
      } else {
        addLog(`Discarded buffered noise: "${buffered}"`, 'info');
      }
    }
  }, [isSpeaking]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isThinking) return;

    // Resume AudioContext on user interaction (fixes autoplay policy)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        addLog('AudioContext resumed on user interaction', 'info');
      } catch (err) {
        console.error('Failed to resume AudioContext:', err);
      }
    }

    const text = inputText;
    setInputText('');

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content: text };
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      // Get AI response with streaming
      getAIResponseStreaming(text, prev);
      return newMessages;
    });
  };

  const handleStartSession = async () => {
    // This click serves as the user gesture that unlocks audio playback
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    // Play a silent audio to fully unlock HTMLAudioElement playback
    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    try { await silentAudio.play(); } catch (_) { /* ignore */ }
    setSessionStarted(true);
  };

  const formatTime = () => {
    return new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex h-screen bg-black relative overflow-hidden">
      {/* Cyberpunk Background Effects - Orange Holographic Grid */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-orange-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-orange-400/10 rounded-full blur-3xl"></div>
      </div>

      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-orange-500/5 to-transparent" style={{ backgroundSize: '100% 4px', backgroundRepeat: 'repeat' }}></div>

      {/* Sidebar */}
      <aside className="w-64 bg-black/90 backdrop-blur-xl border-r border-orange-500/30 flex flex-col shadow-2xl shadow-orange-500/20 relative z-10">
        <div className="p-6 border-b border-orange-500/30 bg-gradient-to-b from-orange-950/50 to-black/50 relative">
          {/* Tech corner accents */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-orange-500/50"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-orange-500/50"></div>

          <div className="mb-2">
            <h1 className="text-3xl font-bold text-orange-500 tracking-widest mb-1" style={{ fontFamily: 'monospace', textShadow: '0 0 20px rgba(249, 115, 22, 0.8), 0 0 40px rgba(249, 115, 22, 0.4), 0 0 60px rgba(249, 115, 22, 0.2)' }}>
              <span className="inline-block transform hover:scale-105 transition-transform">S</span>
              <span className="inline-block transform hover:scale-105 transition-transform">A</span>
              <span className="inline-block transform hover:scale-105 transition-transform">K</span>
              <span className="inline-block transform hover:scale-105 transition-transform">U</span>
              <span className="inline-block transform hover:scale-105 transition-transform">R</span>
              <span className="inline-block transform hover:scale-105 transition-transform">A</span>
            </h1>
            <p className="text-[10px] text-orange-500/70 font-mono tracking-widest uppercase">// AI.INTERFACE.v2.0</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full px-4 py-3 text-left text-orange-400 bg-orange-950/50 hover:bg-orange-900/50 border border-orange-500/50 hover:border-orange-500 transition-all duration-200 font-mono text-xs tracking-wider uppercase shadow-lg shadow-orange-500/20 clip-corners-small" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.5)' }}>
            {'>'} CHAT.INTERFACE
          </button>
          <button className="w-full px-4 py-3 text-left text-orange-600/50 hover:text-orange-400 hover:bg-orange-950/30 border border-orange-900/30 hover:border-orange-700/50 transition-all duration-200 font-mono text-xs tracking-wider uppercase clip-corners-small">
            {'>'} MEMORY.BANKS
          </button>
          <button className="w-full px-4 py-3 text-left text-orange-600/50 hover:text-orange-400 hover:bg-orange-950/30 border border-orange-900/30 hover:border-orange-700/50 transition-all duration-200 font-mono text-xs tracking-wider uppercase clip-corners-small">
            {'>'} SYSTEM.CONFIG
          </button>
          {!showLogs && (
            <button
              onClick={() => setShowLogs(true)}
              className="w-full px-4 py-3 text-left text-orange-500 hover:bg-orange-950/30 border border-orange-600/40 hover:border-orange-500/60 transition-all duration-200 font-mono text-xs tracking-wider uppercase clip-corners-small"
            >
              {'>'} LOGS.VIEW
            </button>
          )}
        </nav>

        {/* Performance Metrics */}
        {showMetrics && currentMetrics && (
          <div className="p-4 border-t border-orange-500/30 bg-black/60 backdrop-blur-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
                ⚡ PERF.METRICS
              </h3>
              <button
                onClick={() => setShowMetrics(false)}
                className="text-xs text-orange-700 hover:text-orange-500 transition-colors font-mono"
              >
                [X]
              </button>
            </div>
            <div className="space-y-2 text-xs font-mono">
              {currentMetrics.ttft !== undefined && (
                <div className="flex justify-between items-center bg-orange-950/50 border border-orange-700/30 px-3 py-2 clip-corners-small">
                  <span className="text-orange-600 text-[10px] tracking-wider">FIRST.TOKEN</span>
                  <span className="font-semibold text-orange-400 text-xs">{currentMetrics.ttft}<span className="text-orange-700 text-[9px] ml-0.5">ms</span></span>
                </div>
              )}
              {currentMetrics.firstAudioStart !== undefined && (
                <div className="flex justify-between items-center bg-orange-950/50 border border-green-700/30 px-3 py-2 clip-corners-small">
                  <span className="text-green-600 text-[10px] tracking-wider">FIRST.AUDIO</span>
                  <span className="font-semibold text-green-400 text-xs">{currentMetrics.firstAudioStart}<span className="text-green-700 text-[9px] ml-0.5">ms</span></span>
                </div>
              )}
              {currentMetrics.totalTime !== undefined && (
                <div className="flex justify-between items-center bg-orange-950/50 border border-orange-700/30 px-3 py-2 clip-corners-small">
                  <span className="text-orange-600 text-[10px] tracking-wider">TOTAL.TIME</span>
                  <span className="font-semibold text-orange-400 text-xs">{currentMetrics.totalTime}<span className="text-orange-700 text-[9px] ml-0.5">ms</span></span>
                </div>
              )}
              {currentMetrics.sentenceCount !== undefined && (
                <div className="flex justify-between items-center bg-orange-950/50 border border-orange-700/30 px-3 py-2 clip-corners-small">
                  <span className="text-orange-600 text-[10px] tracking-wider">SENTENCES</span>
                  <span className="font-semibold text-orange-400 text-xs">{currentMetrics.sentenceCount}</span>
                </div>
              )}
              {currentMetrics.firstAudioStart && currentMetrics.totalTime && (
                <div className="mt-2 pt-2 border-t border-orange-900/50">
                  <div className="flex justify-between items-center bg-orange-600/20 border border-orange-500/50 px-3 py-2 clip-corners-small shadow-lg shadow-orange-500/20" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.5)' }}>
                    <span className="text-orange-400 text-[10px] tracking-wider">OPTIMIZED</span>
                    <span className="font-bold text-orange-400 text-xs">+{Math.round(((currentMetrics.totalTime - currentMetrics.firstAudioStart) / currentMetrics.totalTime) * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Real-Time Logs */}
        {showLogs && (
          <div className="flex-1 flex flex-col border-t border-orange-500/30 bg-black/80 overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b border-orange-900/50 bg-orange-950/30">
              <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
                📊 SYSTEM.LOGS
              </h3>
              <div className="flex gap-2 font-mono">
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] text-orange-700 hover:text-orange-500"
                  title="Clear logs"
                >
                  [CLR]
                </button>
                <button
                  onClick={() => setShowLogs(false)}
                  className="text-[10px] text-orange-700 hover:text-orange-500"
                  title="Hide logs"
                >
                  [X]
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-[10px]">
              {logs.length === 0 ? (
                <div className="text-center text-orange-700 py-6 text-xs font-mono">NO LOGS AVAILABLE</div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 p-2 bg-orange-950/30 hover:bg-orange-950/50 border border-orange-900/30 hover:border-orange-700/50 transition-all font-mono clip-corners-small"
                  >
                    <span className="flex-shrink-0 text-xs">{log.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-orange-700/70 text-[9px]">{log.timestamp}</span>
                        <span className={`${log.color} font-medium break-words text-[9px]`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        <div className="p-4 border-t border-orange-500/30 bg-black/60 backdrop-blur-sm relative">
          {/* Tech corner accents */}
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-orange-500/50"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-orange-500/50"></div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className={`w-2 h-2 ${
              isListening ? (isRecording ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' : 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse') : 'bg-gray-600'
            }`}></div>
            <span className="text-orange-500 tracking-wider uppercase" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.5)' }}>
              {isSpeaking ? 'SPEAKING' : isProcessing ? 'PROCESSING' : isRecording ? 'RECORDING' : isListening ? 'LISTENING' : 'STANDBY'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area - Sci-Fi Terminal Style */}
      <main className="flex-1 flex flex-row">
        {/* Chat Section */}
        <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-black/80 backdrop-blur-xl border-b border-orange-500/30 p-4 shadow-2xl shadow-orange-500/20 relative z-10">
          {/* Tech corner accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-orange-500/50"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-orange-500/50"></div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h2 className="text-2xl font-mono font-bold text-orange-500 tracking-widest" style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.8), 0 0 40px rgba(249, 115, 22, 0.4)' }}>
                  SAKURA
                </h2>
                <p className="text-[10px] text-orange-600/70 font-mono tracking-wider uppercase">AI.COMPANION.INTERFACE</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 bg-orange-950/30 hover:bg-orange-950/60 border border-orange-500/30 hover:border-orange-500/60 text-orange-500 transition-all duration-200 clip-corners"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <div className="text-[10px] font-mono text-orange-600/70 tracking-widest uppercase">{formatTime()}</div>
            </div>
          </div>
        </header>

        {/* Chat Messages - Cyberpunk Terminal Style */}
        <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-black via-orange-950/10 to-black relative">
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(249, 115, 22, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(249, 115, 22, 0.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

          <div className="max-w-3xl mx-auto space-y-4 relative">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="text-center py-16 space-y-8 relative">
                <div className="space-y-3">
                  <h3 className="text-6xl font-mono font-bold text-orange-500 tracking-widest" style={{ textShadow: '0 0 30px rgba(249, 115, 22, 1), 0 0 60px rgba(249, 115, 22, 0.6), 0 0 90px rgba(249, 115, 22, 0.3)' }}>
                    {'>'} SAKURA
                  </h3>
                  <p className="text-lg text-orange-600/70 font-mono tracking-wider uppercase" style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.5)' }}>
                    .ONLINE
                  </p>
                  <p className="text-xs text-orange-600/70 font-mono tracking-wider uppercase">
                    AI.COMPANION.INTERFACE.INITIALIZED
                  </p>
                </div>

                <div className="max-w-md mx-auto">
                  <div className="bg-orange-950/30 backdrop-blur-sm p-6 border border-orange-500/30 shadow-xl clip-corners">
                    <p className="text-orange-400/90 text-sm leading-relaxed font-mono">
                      {'> '} VOICE.INPUT: ACTIVE<br/>
                      {'> '} TEXT.INPUT: ACTIVE<br/>
                      {'> '} NEURAL.NET: READY<br/>
                      <span className="text-orange-500">{'> '} AWAITING.COMMAND...</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 justify-center text-xs font-mono">
                  <div className="px-4 py-2 bg-green-950/50 border border-green-500/50 text-green-400 flex items-center gap-2 shadow-lg shadow-green-500/20 clip-corners-small">
                    <span className="text-green-500 animate-pulse">■</span>
                    VOICE.ACTIVE
                  </div>
                  <div className="px-4 py-2 bg-orange-950/50 border border-orange-500/50 text-orange-400 flex items-center gap-2 shadow-lg shadow-orange-500/20 clip-corners-small">
                    <span className="text-orange-500 animate-pulse">■</span>
                    SYSTEM.READY
                  </div>
                </div>
              </div>
            )}

            {/* Messages - Cyberpunk Terminal Style */}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div className="flex flex-col max-w-[70%]">
                  {message.role === 'assistant' && (
                    <span className="text-xs font-mono font-bold text-orange-500 mb-1 tracking-wider uppercase" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.6)' }}>{'> '} SAKURA</span>
                  )}
                  <div
                    className={`px-4 py-3 shadow-xl relative backdrop-blur-sm ${
                      message.role === 'user'
                        ? 'bg-orange-950/80 text-orange-100 border border-orange-500/50 shadow-orange-500/30 clip-corners'
                        : 'bg-black/80 text-orange-200 border border-orange-700/30 shadow-orange-900/40 clip-corners'
                    }`}
                    style={{
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono">{message.content}</p>
                  </div>
                </div>

                {/* User side avatar */}
                {message.role === 'user' && (
                  <div className="relative flex-shrink-0 ml-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-700 to-orange-900 flex items-center justify-center text-lg shadow-xl shadow-orange-600/40 border border-orange-600/50 clip-corners">
                      <span className="text-orange-300">👤</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Thinking Indicator */}
            {isThinking && (
              <div className="flex justify-start animate-fade-in">
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-bold text-orange-500 mb-1 tracking-wider uppercase" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.6)' }}>{'> '} SAKURA</span>
                  <div className="bg-black/80 backdrop-blur-sm px-5 py-3 shadow-xl border border-orange-700/30 shadow-orange-900/40 relative clip-corners">
                    <div className="flex space-x-2 items-center font-mono">
                      <div className="w-2 h-2 bg-orange-500 animate-bounce shadow-sm" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-orange-600 animate-bounce shadow-sm" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-orange-500 animate-bounce shadow-sm" style={{ animationDelay: '300ms' }}></div>
                      <span className="text-[10px] text-orange-600 font-medium ml-2 tracking-wider uppercase">PROCESSING...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - Cyberpunk Terminal Style */}
        <footer className="bg-black/90 backdrop-blur-xl border-t border-orange-500/30 p-5 shadow-2xl shadow-orange-500/20 relative">
          {/* Tech corner accents */}
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-orange-500/50"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-orange-500/50"></div>

          <div className="max-w-3xl mx-auto space-y-3">
            {/* Waveform Visualizer */}
            <WaveformVisualizer
              isActive={isRecording}
              volume={volume}
            />

            {/* Input Controls */}
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <button
                  onClick={isListening ? handleStopListening : handleStartListening}
                  className={`flex-shrink-0 w-12 h-12 flex items-center justify-center transition-all duration-200 shadow-xl border clip-corners ${
                    isListening
                      ? 'bg-green-950/80 hover:bg-green-900/80 shadow-green-500/40 border-green-500/50 text-green-400'
                      : 'bg-orange-950/80 hover:bg-orange-900/80 shadow-orange-500/40 border-orange-500/50 text-orange-400'
                  }`}
                  title={isListening ? 'Listening active' : 'Start listening'}
                  style={isListening ? { textShadow: '0 0 10px rgba(34, 197, 94, 0.8)' } : { textShadow: '0 0 10px rgba(249, 115, 22, 0.8)' }}
                >
                  <span className="text-xl">🎤</span>
                </button>

                {(isListening || isThinking || isSpeaking) && (
                  <button
                    onClick={handleStopAll}
                    className="flex-shrink-0 w-12 h-12 flex items-center justify-center transition-all duration-200 shadow-xl border clip-corners bg-red-950/80 hover:bg-red-900/80 shadow-red-500/40 border-red-500/50 text-red-400"
                    title="Stop all - listening, processing, and voice"
                    style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.8)' }}
                  >
                    <span className="text-xl font-bold">■</span>
                  </button>
                )}
              </div>

              <div className="flex-1 flex items-center bg-orange-950/30 px-5 py-3 border border-orange-700/30 focus-within:border-orange-500/60 focus-within:shadow-lg focus-within:shadow-orange-500/20 transition-all clip-corners">
                <span className="text-orange-600 font-mono text-sm mr-2">{'>'}</span>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="ENTER.COMMAND..."
                  className="flex-1 bg-transparent focus:outline-none text-orange-200 placeholder-orange-700/50 text-sm font-mono tracking-wider"
                  disabled={isRecording || isThinking}
                />
              </div>

              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isRecording || isThinking}
                className="flex-shrink-0 w-12 h-12 bg-orange-950/80 hover:bg-orange-900/80 disabled:bg-gray-900/80 text-orange-400 disabled:text-gray-600 flex items-center justify-center transition-all duration-200 shadow-xl disabled:shadow-none shadow-orange-500/40 disabled:cursor-not-allowed border border-orange-500/50 disabled:border-gray-700/30 clip-corners"
                style={!inputText.trim() || isRecording || isThinking ? {} : { textShadow: '0 0 10px rgba(249, 115, 22, 0.8)' }}
              >
                <span className="text-xl">↑</span>
              </button>
            </div>
          </div>
        </footer>
        </div>

        {/* Search Results Sidebar */}
        {searchResults && (
          <aside className="w-96 bg-black/90 backdrop-blur-xl border-l border-orange-500/30 flex flex-col shadow-2xl shadow-orange-500/20 relative z-10 overflow-hidden">
            {/* Header */}
            <div className="bg-orange-950/50 p-4 border-b border-orange-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-orange-500 text-lg">🔍</span>
                <div>
                  <h3 className="text-xs font-mono font-bold text-orange-500 tracking-wider uppercase" style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.6)' }}>
                    WEB.SEARCH.RESULTS
                  </h3>
                  <p className="text-[10px] text-orange-600/70 font-mono mt-0.5">
                    QUERY: "{searchResults.query}"
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSearchResults(null)}
                className="text-orange-600 hover:text-orange-400 transition-colors font-mono text-xs px-2 py-1 hover:bg-orange-950/50 clip-corners-small"
                title="Close search results"
              >
                [X]
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchResults.results.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-orange-600/70 text-sm font-mono">
                    {searchResults.message || 'No results found'}
                  </p>
                </div>
              ) : (
                searchResults.results.map((result, idx) => (
                  <div
                    key={idx}
                    className="bg-orange-950/30 border border-orange-700/30 p-3 hover:bg-orange-950/50 hover:border-orange-600/50 transition-all clip-corners-small animate-fade-in"
                  >
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <h4 className="text-sm font-mono font-bold text-orange-400 group-hover:text-orange-300 transition-colors mb-1 flex items-start gap-2">
                        <span className="text-orange-600 text-xs mt-0.5">▸</span>
                        <span className="flex-1">{result.title}</span>
                      </h4>
                      <p className="text-xs text-orange-600/80 font-mono leading-relaxed mb-2 pl-5">
                        {result.snippet}
                      </p>
                      <div className="text-[10px] text-orange-700/60 font-mono truncate pl-5 group-hover:text-orange-600/80 transition-colors">
                        {result.url}
                      </div>
                    </a>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-black/90 border border-orange-500/50 p-8 max-w-lg w-full shadow-2xl shadow-orange-500/30 clip-corners max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-mono font-bold text-orange-500 tracking-widest uppercase" style={{ textShadow: '0 0 20px rgba(249, 115, 22, 0.6)' }}>
                {'>'} VOICE.SETTINGS
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-orange-500 hover:text-orange-400 transition-colors font-mono text-lg"
              >
                [X]
              </button>
            </div>

            <div className="space-y-6">
              {/* Voice Selection */}
              <div>
                <label className="text-xs font-mono text-orange-600 tracking-widest uppercase block mb-3">
                  VOICE.TYPE
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'nova', label: 'Nova', desc: 'Warm, female' },
                    { id: 'alloy', label: 'Alloy', desc: 'Neutral, balanced' },
                    { id: 'echo', label: 'Echo', desc: 'Warm, male' },
                    { id: 'fable', label: 'Fable', desc: 'Expressive, British' },
                    { id: 'onyx', label: 'Onyx', desc: 'Deep, male' },
                    { id: 'shimmer', label: 'Shimmer', desc: 'Bright, female' },
                  ] as const).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setVoiceSettings(prev => ({ ...prev, voice: v.id }));
                        voiceSettingsRef.current = { ...voiceSettingsRef.current, voice: v.id };
                      }}
                      className={`px-3 py-2 text-left font-mono text-sm transition-all duration-200 clip-corners-small ${
                        voiceSettings.voice === v.id
                          ? 'bg-orange-950/80 text-orange-300 border border-orange-500/60 shadow-lg shadow-orange-500/30'
                          : 'bg-orange-950/30 text-orange-600 border border-orange-700/30 hover:border-orange-600/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          voiceSettings.voice === v.id ? 'bg-orange-500 shadow-lg shadow-orange-500/50' : 'bg-orange-800'
                        }`}></div>
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xs">{v.label}</div>
                          <div className="text-[9px] text-orange-600/70">{v.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Quality */}
              <div>
                <label className="text-xs font-mono text-orange-600 tracking-widest uppercase block mb-3">
                  QUALITY.MODEL
                </label>
                <div className="flex gap-2">
                  {([
                    { id: 'tts-1', label: 'Standard', desc: 'Faster, lower latency' },
                    { id: 'tts-1-hd', label: 'HD', desc: 'More natural, higher quality' },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setVoiceSettings(prev => ({ ...prev, model: m.id }));
                        voiceSettingsRef.current = { ...voiceSettingsRef.current, model: m.id };
                      }}
                      className={`flex-1 px-4 py-3 text-left font-mono text-sm transition-all duration-200 clip-corners-small ${
                        voiceSettings.model === m.id
                          ? 'bg-orange-950/80 text-orange-300 border border-orange-500/60 shadow-lg shadow-orange-500/30'
                          : 'bg-orange-950/30 text-orange-600 border border-orange-700/30 hover:border-orange-600/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          voiceSettings.model === m.id ? 'bg-orange-500 shadow-lg shadow-orange-500/50' : 'bg-orange-800'
                        }`}></div>
                        <div>
                          <div className="font-bold tracking-wider uppercase text-xs">{m.label}</div>
                          <div className="text-[9px] text-orange-600/70">{m.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed Slider */}
              <div>
                <label className="text-xs font-mono text-orange-600 tracking-widest uppercase block mb-3">
                  SPEECH.SPEED: <span className="text-orange-400">{voiceSettings.speed?.toFixed(2)}x</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-orange-700">0.5x</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={voiceSettings.speed}
                    onChange={(e) => {
                      const speed = parseFloat(e.target.value);
                      setVoiceSettings(prev => ({ ...prev, speed }));
                      voiceSettingsRef.current = { ...voiceSettingsRef.current, speed };
                    }}
                    className="flex-1 h-1 appearance-none bg-orange-900/50 rounded-full outline-none accent-orange-500"
                  />
                  <span className="text-[10px] font-mono text-orange-700">2.0x</span>
                </div>
                <div className="flex justify-between mt-2">
                  {[0.75, 1.0, 1.25, 1.5].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setVoiceSettings(prev => ({ ...prev, speed: preset }));
                        voiceSettingsRef.current = { ...voiceSettingsRef.current, speed: preset };
                      }}
                      className={`px-3 py-1 font-mono text-[10px] transition-all clip-corners-small ${
                        voiceSettings.speed === preset
                          ? 'bg-orange-950/80 text-orange-300 border border-orange-500/60'
                          : 'bg-orange-950/30 text-orange-700 border border-orange-900/30 hover:border-orange-600/50 hover:text-orange-500'
                      }`}
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Button */}
              <div className="pt-4 border-t border-orange-900/50">
                <button
                  onClick={async () => {
                    addLog(`Testing voice: ${voiceSettings.voice}, speed: ${voiceSettings.speed}, model: ${voiceSettings.model}`, 'info');
                    try {
                      const result = await synthesizeSpeech('Hello! This is how I sound with the current settings.', false, voiceSettings);
                      if (result.success && result.audioData) {
                        const binaryString = atob(result.audioData);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                        const blob = new Blob([bytes], { type: 'audio/mpeg' });
                        const url = URL.createObjectURL(blob);
                        const audio = new Audio(url);
                        audio.onended = () => URL.revokeObjectURL(url);
                        audio.play();
                      }
                    } catch (err: any) {
                      addLog(`Preview failed: ${err.message}`, 'error');
                    }
                  }}
                  className="w-full px-6 py-3 bg-orange-950/80 hover:bg-orange-900/80 text-orange-400 font-mono text-sm tracking-wider uppercase border border-orange-500/50 hover:border-orange-500 transition-all duration-200 shadow-lg shadow-orange-500/30 clip-corners"
                  style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.6)' }}
                >
                  {'>'} PREVIEW.VOICE
                </button>
                <p className="text-[10px] text-orange-700 font-mono mt-3 text-center">
                  Changes apply immediately to all new speech
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Session Overlay - Required for browser audio policy */}
      {!sessionStarted && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-50">
          <div className="text-center space-y-8">
            <div className="space-y-3">
              <h1 className="text-6xl font-mono font-bold text-orange-500 tracking-widest" style={{ textShadow: '0 0 30px rgba(249, 115, 22, 1), 0 0 60px rgba(249, 115, 22, 0.6), 0 0 90px rgba(249, 115, 22, 0.3)' }}>
                SAKURA
              </h1>
              <p className="text-sm text-orange-600/70 font-mono tracking-wider uppercase">
                AI.COMPANION.INTERFACE
              </p>
            </div>
            <button
              onClick={handleStartSession}
              className="px-12 py-4 bg-orange-950/80 hover:bg-orange-900/80 text-orange-400 hover:text-orange-300 font-mono text-lg tracking-widest uppercase border border-orange-500/50 hover:border-orange-500 transition-all duration-300 shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 clip-corners animate-pulse"
              style={{ textShadow: '0 0 15px rgba(249, 115, 22, 0.8)' }}
            >
              {'>'} INITIALIZE.SESSION
            </button>
            <p className="text-[10px] text-orange-700/50 font-mono tracking-wider">
              CLICK TO ENABLE VOICE &amp; AUDIO SYSTEMS
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .clip-corners {
          clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
        }
        .clip-corners-small {
          clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
        }
      `}</style>
    </div>
  );
}

export default App;
