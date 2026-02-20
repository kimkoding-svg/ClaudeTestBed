import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  startCouple,
  resetCouple,
  stopCouple,
  connectCoupleSSE,
  getCoupleLogs,
  getCoupleLog,
  type PersonProfile,
  type CoupleSSEEvent,
  type LogSummary,
  type SavedLog,
} from '../services/coupleApi';
import { computePanelStyle } from '../utils/personalityStyle';

// ─── Types ─────────────────────────────────────────────────

interface ChatMessage {
  speaker: 'A' | 'B';
  speakerName: string;
  text: string;
  sentiment: number;
  topic: string;
  timestamp: string;
}

interface TraitDelta {
  [trait: string]: number;
}

interface Props {
  onBack: () => void;
}

// ─── Helpers ───────────────────────────────────────────────

function moodEmoji(mood: number): string {
  if (mood >= 70) return '\u{1F60A}';
  if (mood >= 50) return '\u{1F610}';
  if (mood >= 30) return '\u{1F612}';
  if (mood >= 15) return '\u{1F624}';
  return '\u{1F92C}';
}

// ─── Profile Panel Component (Dynamic Styling) ─────────────

function ProfilePanel({
  profile,
  side,
  deltas,
}: {
  profile: PersonProfile;
  side: 'left' | 'right';
  deltas: TraitDelta;
}) {
  const ps = useMemo(() => computePanelStyle(profile), [profile]);

  const traits = [
    { key: 'friendliness', label: 'Friendly' },
    { key: 'humor', label: 'Humor' },
    { key: 'sarcasm', label: 'Sarcasm' },
    { key: 'empathy', label: 'Empathy' },
    { key: 'assertiveness', label: 'Assert.' },
    { key: 'intelligence', label: 'Intellect' },
    { key: 'patience', label: 'Patience' },
    { key: 'confidence', label: 'Confid.' },
    { key: 'emotionalStability', label: 'Stability' },
    { key: 'pettiness', label: 'Petty' },
    { key: 'openMindedness', label: 'Open' },
  ];

  const borderSide = side === 'left' ? 'border-r' : 'border-l';

  return (
    <div
      className={`w-[280px] min-w-[280px] flex flex-col text-white overflow-y-auto ${borderSide} ${ps.animClass}`}
      style={{
        background: ps.bgGradient,
        fontFamily: ps.fontFamily,
        borderColor: ps.accentColor + '40',
      }}
    >
      {/* Avatar & Name */}
      <div className="p-4 text-center" style={{ borderBottom: `1px solid ${ps.accentColor}30` }}>
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className="w-24 h-24 object-cover mx-auto mb-2"
            style={{ borderRadius: ps.borderRadius, border: ps.borderStyle }}
          />
        ) : (
          <div
            className="w-24 h-24 flex items-center justify-center mx-auto mb-2 animate-pulse"
            style={{ background: ps.accentMuted, borderRadius: ps.borderRadius, border: ps.borderStyle }}
          >
            <span className="text-4xl">{profile.avatar}</span>
          </div>
        )}
        <div className="font-bold text-lg" style={{ color: ps.textPrimary }}>
          {profile.name}, {profile.age}
        </div>
        <div className="text-[11px] font-bold italic mt-0.5" style={{ color: ps.accentColor }}>
          {profile.archetype}
        </div>
        <div className="text-xs mt-0.5" style={{ color: ps.textSecondary }}>
          {profile.gender === 'male' ? '\u2642' : '\u2640'} {profile.occupation}
        </div>
        <div className="text-xs mt-0.5" style={{ color: ps.textSecondary + '80' }}>
          {'\uD83C\uDF0D'} {profile.region}
        </div>
        {profile.textingStyle && (
          <span
            className="inline-block mt-1.5 px-2 py-0.5 text-[10px]"
            style={{
              background: ps.accentMuted,
              color: ps.accentColor,
              border: `1px solid ${ps.accentColor}40`,
              borderRadius: ps.borderRadius,
            }}
          >
            {'\uD83D\uDCAC'} {profile.textingStyle}
          </span>
        )}
      </div>

      {/* Traits */}
      <div className="p-3" style={{ borderBottom: `1px solid ${ps.accentColor}30`, backgroundImage: ps.sectionBg.traits }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: ps.accentColor }}>
          Traits
        </div>
        {traits.map(({ key, label }) => {
          const value = profile.traits[key as keyof typeof profile.traits];
          const delta = deltas[key] || 0;
          return (
            <div key={key} className="mb-1">
              <div className="flex items-center justify-between text-[11px] mb-0">
                <span style={{ color: ps.textSecondary }}>{label}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px]" style={{ color: ps.textPrimary }}>{value}</span>
                  {delta !== 0 && (
                    <span className={`font-bold text-[9px] animate-pulse ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {delta > 0 ? `\u2191+${delta}` : `\u2193${delta}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: ps.bgColor }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${value}%`, backgroundColor: ps.traitBarColor(value) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mood */}
      <div className="p-3" style={{ borderBottom: `1px solid ${ps.accentColor}30`, backgroundImage: ps.sectionBg.mood }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ps.accentColor }}>
          Mood
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{moodEmoji(profile.mood)}</span>
          <span className="font-mono text-base font-bold" style={{ color: ps.accentColor }}>
            {profile.mood}
          </span>
          {deltas['mood'] && deltas['mood'] !== 0 && (
            <span className={`font-bold text-xs animate-pulse ${deltas['mood'] > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {deltas['mood'] > 0 ? `\u2191+${deltas['mood']}` : `\u2193${deltas['mood']}`}
            </span>
          )}
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: ps.bgColor }}>
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${profile.mood}%`, backgroundColor: ps.accentColor }}
          />
        </div>
      </div>

      {/* Interests */}
      <div
        className="p-3"
        style={{
          borderBottom: `1px solid ${ps.accentColor}30`,
          backgroundImage: ps.sectionBg.interests,
          backgroundSize: '12px 12px',
        }}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ps.accentColor }}>
          Interests
        </div>
        <div className="flex flex-wrap gap-1">
          {profile.interests.map((interest, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 text-[10px]"
              style={{
                background: ps.accentMuted,
                color: ps.accentColor,
                borderRadius: ps.borderRadius,
                border: `1px solid ${ps.accentColor}40`,
              }}
            >
              {interest}
            </span>
          ))}
        </div>
      </div>

      {/* Trigger */}
      <div className="p-3" style={{ borderBottom: `1px solid ${ps.accentColor}30`, backgroundImage: ps.sectionBg.trigger }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#f59e0b' }}>
          {'\u26A1'} Trigger
        </div>
        <div
          className="text-[11px] italic p-2 rounded"
          style={{
            color: '#fde68a',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          {profile.trigger}
        </div>
      </div>

      {/* Condition (if any) */}
      {profile.condition && (
        <div className="p-3" style={{ borderBottom: `1px solid ${ps.accentColor}30`, backgroundImage: ps.sectionBg.condition }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ps.accentColor }}>
            {'\uD83E\uDDE0'} Condition
          </div>
          <div
            className="text-[11px] p-2 rounded"
            style={{
              background: ps.accentMuted,
              border: `1px solid ${ps.accentColor}40`,
            }}
          >
            <span className="font-bold" style={{ color: ps.accentColor }}>{profile.condition.name}</span>
            <span className="ml-1.5" style={{ color: ps.textSecondary }}>{'\u2014'} {profile.condition.label}</span>
          </div>
        </div>
      )}

      {/* Quirk */}
      <div className="p-3" style={{ backgroundImage: ps.sectionBg.quirk }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ps.accentColor }}>
          Quirk
        </div>
        <div className="text-[11px] italic" style={{ color: ps.textSecondary }}>
          {profile.quirk}
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Chat Bubble ──────────────────────────────────

function ChatBubble({ msg, side }: { msg: ChatMessage; side: 'left' | 'right' }) {
  const isRight = side === 'right';

  return (
    <div className={`flex ${isRight ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
      <div
        className={`relative max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm ${
          isRight
            ? 'bg-[#DCF8C6] rounded-tr-none'
            : 'bg-white rounded-tl-none'
        }`}
        style={{
          // WhatsApp tail
        }}
      >
        {/* Tail */}
        <div
          className={`absolute top-0 w-0 h-0 ${
            isRight
              ? '-right-2 border-l-8 border-l-[#DCF8C6] border-t-8 border-t-transparent'
              : '-left-2 border-r-8 border-r-white border-t-8 border-t-transparent'
          }`}
        />
        <div className="text-[14.5px] text-gray-900 leading-snug pr-16">
          {msg.text}
        </div>
        <div className="flex items-center justify-end gap-1 -mt-1">
          <span className="text-[10.5px] text-gray-500">{msg.timestamp}</span>
          {isRight && (
            <span className="text-blue-500 text-[11px]">{'\u2713\u2713'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Typing Indicator ──────────────────────────────────────

function TypingIndicator({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
      <div
        className={`relative px-4 py-2 rounded-lg shadow-sm ${
          side === 'right'
            ? 'bg-[#DCF8C6] rounded-tr-none'
            : 'bg-white rounded-tl-none'
        }`}
      >
        <div
          className={`absolute top-0 w-0 h-0 ${
            side === 'right'
              ? '-right-2 border-l-8 border-l-[#DCF8C6] border-t-8 border-t-transparent'
              : '-left-2 border-r-8 border-r-white border-t-8 border-t-transparent'
          }`}
        />
        <div className="flex gap-1 items-center">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────

export function CouplePage({ onBack }: Props) {
  const [profileA, setProfileA] = useState<PersonProfile | null>(null);
  const [profileB, setProfileB] = useState<PersonProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<{ speaker: 'A' | 'B'; name: string } | null>(null);
  const [deltasA, setDeltasA] = useState<TraitDelta>({});
  const [deltasB, setDeltasB] = useState<TraitDelta>({});
  const [topic, setTopic] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showPastLogs, setShowPastLogs] = useState(false);
  const [pastLogs, setPastLogs] = useState<LogSummary[]>([]);
  const [viewingLog, setViewingLog] = useState<SavedLog | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const deltaTimerA = useRef<ReturnType<typeof setTimeout>>();
  const deltaTimerB = useRef<ReturnType<typeof setTimeout>>();

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  // SSE event handler
  const handleSSEEvent = useCallback((event: CoupleSSEEvent) => {
    switch (event.type) {
      case 'couple_profiles':
        if (event.profileA) setProfileA(event.profileA);
        if (event.profileB) setProfileB(event.profileB);
        break;

      case 'typing':
        if (event.speaker) {
          const name = event.speaker === 'A' ? profileA?.name || 'Person A' : profileB?.name || 'Person B';
          setTyping({ speaker: event.speaker, name });
        }
        break;

      case 'message': {
        setTyping(null);

        if (event.text && event.speaker) {
          const newMsg: ChatMessage = {
            speaker: event.speaker,
            speakerName: event.speakerName || '',
            text: event.text,
            sentiment: event.sentiment || 0,
            topic: event.topic || '',
            timestamp: event.timestamp || '',
          };
          setMessages(prev => [...prev, newMsg]);
        }

        if (event.topic) setTopic(event.topic);

        // Update profiles
        if (event.profileA) setProfileA(event.profileA);
        if (event.profileB) setProfileB(event.profileB);

        // Show trait deltas with auto-clear after 3s
        if (event.traitDeltas) {
          if (event.traitDeltas['A']) {
            setDeltasA(event.traitDeltas['A']);
            clearTimeout(deltaTimerA.current);
            deltaTimerA.current = setTimeout(() => setDeltasA({}), 3000);
          }
          if (event.traitDeltas['B']) {
            setDeltasB(event.traitDeltas['B']);
            clearTimeout(deltaTimerB.current);
            deltaTimerB.current = setTimeout(() => setDeltasB({}), 3000);
          }
        }
        break;
      }

      case 'avatar_update':
        if (event.profileA) setProfileA(event.profileA);
        if (event.profileB) setProfileB(event.profileB);
        break;

      case 'error':
        console.error('Couple SSE error:', event.message);
        break;
    }
  }, [profileA?.name, profileB?.name]);

  // Start conversation
  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      const result = await startCouple();
      setProfileA(result.profileA);
      setProfileB(result.profileB);
      setMessages([]);
      setTyping(null);
      setTopic('');
      setDeltasA({});
      setDeltasB({});
      setStopped(false);
      // Connect SSE
      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = connectCoupleSSE(handleSSEEvent);
    } catch (err) {
      console.error('Failed to start couple:', err);
    } finally {
      setLoading(false);
    }
  }, [handleSSEEvent]);

  // Stop conversation
  const handleStop = useCallback(async () => {
    try {
      // Close SSE first so no stale events arrive
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      await stopCouple();
      setTyping(null);
      setStopped(true);
    } catch (err) {
      console.error('Failed to stop couple:', err);
    }
  }, []);

  // Reset / New Couple
  const handleReset = useCallback(async () => {
    setLoading(true);
    try {
      const result = await resetCouple();
      setProfileA(result.profileA);
      setProfileB(result.profileB);
      setMessages([]);
      setTyping(null);
      setTopic('');
      setDeltasA({});
      setDeltasB({});
      setStopped(false);
      // Reconnect SSE (may have been closed by stop)
      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = connectCoupleSSE(handleSSEEvent);
    } catch (err) {
      console.error('Failed to reset couple:', err);
    } finally {
      setLoading(false);
    }
  }, [handleSSEEvent]);

  // Export conversation log
  const handleExport = useCallback(() => {
    if (!profileA || !profileB || messages.length === 0) return;

    const header = [
      `Couple Chat Log`,
      `Date: ${new Date().toLocaleString()}`,
      ``,
      `Person A: ${profileA.name}, ${profileA.age}, ${profileA.gender}, ${profileA.occupation}`,
      `  Region: ${profileA.region}`,
      `  Archetype: ${profileA.archetype}`,
      `  Condition: ${profileA.condition?.name || 'None'}`,
      `  Texting Style: ${profileA.textingStyle}`,
      ``,
      `Person B: ${profileB.name}, ${profileB.age}, ${profileB.gender}, ${profileB.occupation}`,
      `  Region: ${profileB.region}`,
      `  Archetype: ${profileB.archetype}`,
      `  Condition: ${profileB.condition?.name || 'None'}`,
      `  Texting Style: ${profileB.textingStyle}`,
      ``,
      `${'─'.repeat(60)}`,
      ``,
    ].join('\n');

    const body = messages.map(m => {
      const sentimentLabel = m.sentiment > 0.3 ? ' [+]' : m.sentiment < -0.3 ? ' [-]' : '';
      return `[${m.timestamp}] ${m.speakerName}: ${m.text}${sentimentLabel}`;
    }).join('\n');

    const content = header + body + `\n\n${'─'.repeat(60)}\n${messages.length} messages total\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `couple-chat-${profileA.name}-${profileB.name}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, profileA, profileB]);

  // Fetch past logs list
  const handleShowPastLogs = useCallback(async () => {
    setShowPastLogs(true);
    setViewingLog(null);
    setLoadingLogs(true);
    try {
      const logs = await getCoupleLogs();
      setPastLogs(logs);
    } catch (err) {
      console.error('Failed to fetch past logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // View a specific saved log
  const handleViewLog = useCallback(async (filename: string) => {
    setLoadingLogs(true);
    try {
      const log = await getCoupleLog(filename);
      setViewingLog(log);
    } catch (err) {
      console.error('Failed to fetch log:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // Export a saved log
  const handleExportSavedLog = useCallback((log: SavedLog) => {
    const header = [
      `Couple Chat Log`,
      `Date: ${log.date}`,
      ``,
      `Person A: ${log.profileA.name}, ${log.profileA.age}, ${log.profileA.gender}, ${log.profileA.occupation}`,
      `  Region: ${log.profileA.region}`,
      `  Archetype: ${log.profileA.archetype}`,
      `  Condition: ${log.profileA.condition?.name || 'None'}`,
      `  Texting Style: ${log.profileA.textingStyle}`,
      ``,
      `Person B: ${log.profileB.name}, ${log.profileB.age}, ${log.profileB.gender}, ${log.profileB.occupation}`,
      `  Region: ${log.profileB.region}`,
      `  Archetype: ${log.profileB.archetype}`,
      `  Condition: ${log.profileB.condition?.name || 'None'}`,
      `  Texting Style: ${log.profileB.textingStyle}`,
      ``,
      `${'─'.repeat(60)}`,
      ``,
    ].join('\n');

    const body = log.messages.map(m => {
      const sentimentLabel = m.sentiment > 0.3 ? ' [+]' : m.sentiment < -0.3 ? ' [-]' : '';
      return `[${m.timestamp}] ${m.speakerName}: ${m.text}${sentimentLabel}`;
    }).join('\n');

    const content = header + body + `\n\n${'─'.repeat(60)}\n${log.messages.length} messages total\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `couple-chat-${log.profileA.name}-${log.profileB.name}-${log.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Auto-start on mount
  useEffect(() => {
    handleStart();
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      stopCouple().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ──────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#111827] font-mono">
      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Profile Panel */}
        {profileA ? (
          <ProfilePanel profile={profileA} side="left" deltas={deltasA} />
        ) : (
          <div className="w-[280px] min-w-[280px] bg-[#1a1a2e] flex items-center justify-center text-gray-600">
            Loading...
          </div>
        )}

        {/* Center: WhatsApp Chat */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* WhatsApp Header */}
          <div className="bg-[#075E54] text-white px-4 py-2.5 flex items-center gap-3 shadow-md z-10">
            <button
              onClick={() => {
                stopCouple().catch(() => {});
                onBack();
              }}
              className="text-white/80 hover:text-white text-lg"
            >
              {'\u2190'}
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              {profileA && profileB ? (
                <>
                  {profileA.avatarUrl ? (
                    <img src={profileA.avatarUrl} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="text-base">{profileA.avatar}</span>
                  )}
                  <span className="font-bold text-sm">{profileA.name}</span>
                  <span className="text-white/50 text-xs mx-1">&</span>
                  <span className="font-bold text-sm">{profileB.name}</span>
                  {profileB.avatarUrl ? (
                    <img src={profileB.avatarUrl} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="text-base">{profileB.avatar}</span>
                  )}
                </>
              ) : (
                <span className="text-sm text-white/70">Couple Chat</span>
              )}
            </div>
            {topic && (
              <div className="text-[10px] text-white/60 ml-2 truncate max-w-[120px]">
                💬 {topic}
              </div>
            )}
          </div>

          {/* Chat Area */}
          <div
            className="flex-1 overflow-y-auto py-3"
            style={{ backgroundColor: '#ECE5DD' }}
          >
            {/* Today pill */}
            <div className="flex justify-center mb-3">
              <span className="bg-[#E1F3FB] text-[#5B7A83] text-[11px] px-3 py-1 rounded-md shadow-sm">
                TODAY
              </span>
            </div>

            {/* System message */}
            {profileA && profileB && messages.length === 0 && !typing && (
              <div className="flex justify-center mb-3 px-4">
                <span className="bg-[#FCF4CB] text-[#5B5218] text-[11px] px-4 py-2 rounded-md shadow-sm text-center max-w-md">
                  {profileA.name} ({profileA.occupation}) and {profileB.name} ({profileB.occupation}) just met for the first time...
                </span>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <ChatBubble
                key={i}
                msg={msg}
                side={msg.speaker === 'A' ? 'left' : 'right'}
              />
            ))}

            {/* Typing indicator */}
            {typing && (
              <TypingIndicator
                side={typing.speaker === 'A' ? 'left' : 'right'}
              />
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Log Panel Overlay */}
          {showLog && (
            <div
              className="absolute inset-0 top-[45px] z-20 overflow-y-auto p-4 font-mono text-[12px]"
              style={{ backgroundColor: '#1a1a2e' }}
            >
              <div className="text-gray-400 mb-3 text-[10px] uppercase tracking-wider">
                Conversation Log {'\u2014'} {messages.length} messages
              </div>
              {messages.map((m, i) => {
                const isA = m.speaker === 'A';
                const sentimentColor = m.sentiment > 0.3 ? '#4ade80' : m.sentiment < -0.3 ? '#f87171' : '#9ca3af';
                return (
                  <div key={i} className="mb-2 flex gap-2">
                    <span className="text-gray-600 shrink-0">[{m.timestamp}]</span>
                    <span className={`font-bold shrink-0 ${isA ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {m.speakerName}:
                    </span>
                    <span className="text-gray-300">{m.text}</span>
                    <span className="text-[10px] shrink-0 ml-auto" style={{ color: sentimentColor }}>
                      {m.sentiment > 0 ? '+' : ''}{m.sentiment.toFixed(1)}
                    </span>
                    {m.topic && (
                      <span className="text-[10px] text-gray-600 shrink-0">
                        [{m.topic}]
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Past Logs Overlay */}
          {showPastLogs && (
            <div
              className="absolute inset-0 top-[45px] z-20 overflow-y-auto p-4 font-mono text-[12px]"
              style={{ backgroundColor: '#1a1a2e' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-gray-400 text-[10px] uppercase tracking-wider">
                  {viewingLog ? `${viewingLog.profileA.name} & ${viewingLog.profileB.name}` : 'Saved Conversations'}
                </div>
                <div className="flex gap-2">
                  {viewingLog && (
                    <>
                      <button
                        onClick={() => handleExportSavedLog(viewingLog)}
                        className="px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700"
                      >
                        {'\u2B07'} Export
                      </button>
                      <button
                        onClick={() => setViewingLog(null)}
                        className="px-3 py-1 bg-gray-600 text-white text-[10px] font-bold rounded hover:bg-gray-500"
                      >
                        {'\u2190'} Back
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { setShowPastLogs(false); setViewingLog(null); }}
                    className="px-3 py-1 bg-red-600/80 text-white text-[10px] font-bold rounded hover:bg-red-600"
                  >
                    {'\u2715'} Close
                  </button>
                </div>
              </div>

              {loadingLogs && (
                <div className="text-gray-500 text-center py-8">Loading...</div>
              )}

              {/* Log list view */}
              {!viewingLog && !loadingLogs && (
                <>
                  {pastLogs.length === 0 ? (
                    <div className="text-gray-600 text-center py-8">No saved conversations yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {pastLogs.map((log) => (
                        <button
                          key={log.filename}
                          onClick={() => handleViewLog(log.filename)}
                          className="w-full text-left p-3 rounded border border-gray-700/50 hover:border-gray-600 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-400 font-bold">{log.personA}</span>
                            <span className="text-gray-600 text-[10px]">&</span>
                            <span className="text-amber-400 font-bold">{log.personB}</span>
                            <span className="text-gray-600 text-[10px] ml-auto pl-3">{log.messageCount} msgs</span>
                          </div>
                          {log.date && (
                            <div className="text-gray-600 text-[10px] mt-1">{log.date}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Single log detail view */}
              {viewingLog && !loadingLogs && (
                <div>
                  {/* Profile summary */}
                  <div className="flex gap-4 mb-4 p-3 rounded border border-gray-700/50 bg-white/5">
                    <div className="flex-1">
                      <div className="text-cyan-400 font-bold">{viewingLog.profileA.name}, {viewingLog.profileA.age}</div>
                      <div className="text-gray-500 text-[10px]">{viewingLog.profileA.gender === 'male' ? '\u2642' : '\u2640'} {viewingLog.profileA.occupation} {'\u2014'} {viewingLog.profileA.region}</div>
                      <div className="text-gray-600 text-[10px] italic">{viewingLog.profileA.archetype}</div>
                      {viewingLog.profileA.condition && (
                        <div className="text-purple-400 text-[10px]">{'\uD83E\uDDE0'} {viewingLog.profileA.condition.name}</div>
                      )}
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-amber-400 font-bold">{viewingLog.profileB.name}, {viewingLog.profileB.age}</div>
                      <div className="text-gray-500 text-[10px]">{viewingLog.profileB.gender === 'male' ? '\u2642' : '\u2640'} {viewingLog.profileB.occupation} {'\u2014'} {viewingLog.profileB.region}</div>
                      <div className="text-gray-600 text-[10px] italic">{viewingLog.profileB.archetype}</div>
                      {viewingLog.profileB.condition && (
                        <div className="text-purple-400 text-[10px]">{'\uD83E\uDDE0'} {viewingLog.profileB.condition.name}</div>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  {viewingLog.messages.map((m, i) => {
                    const isA = m.speaker === 'A';
                    const sentimentColor = m.sentiment > 0.3 ? '#4ade80' : m.sentiment < -0.3 ? '#f87171' : '#9ca3af';
                    return (
                      <div key={i} className="mb-2 flex gap-2">
                        <span className="text-gray-600 shrink-0">[{m.timestamp}]</span>
                        <span className={`font-bold shrink-0 ${isA ? 'text-cyan-400' : 'text-amber-400'}`}>
                          {m.speakerName}:
                        </span>
                        <span className="text-gray-300">{m.text}</span>
                        <span className="text-[10px] shrink-0 ml-auto" style={{ color: sentimentColor }}>
                          {m.sentiment > 0 ? '+' : ''}{m.sentiment.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom bar */}
          <div className="bg-[#F0F0F0] border-t border-gray-300 px-4 py-2 flex items-center justify-center gap-3">
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-4 py-1.5 bg-[#075E54] text-white text-xs font-bold rounded-full hover:bg-[#064E46] transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : '🔄 New Couple'}
            </button>
            {!stopped ? (
              <button
                onClick={handleStop}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full hover:bg-red-700 transition-colors"
              >
                ⏹ Stop
              </button>
            ) : (
              <span className="text-xs text-gray-500 font-bold">Stopped</span>
            )}
            {messages.length > 0 && (
              <>
                <button
                  onClick={() => setShowLog(!showLog)}
                  className="px-4 py-1.5 bg-gray-700 text-white text-xs font-bold rounded-full hover:bg-gray-600 transition-colors"
                >
                  {showLog ? 'Hide Log' : '\uD83D\uDCDC Log'}
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-full hover:bg-blue-700 transition-colors"
                >
                  {'\u2B07'} Export
                </button>
                <span className="text-[10px] text-gray-500">
                  {messages.length} messages
                </span>
              </>
            )}
            <button
              onClick={handleShowPastLogs}
              className="px-4 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-full hover:bg-purple-700 transition-colors"
            >
              {'\uD83D\uDCC1'} Past Logs
            </button>
          </div>
        </div>

        {/* Right Profile Panel */}
        {profileB ? (
          <ProfilePanel profile={profileB} side="right" deltas={deltasB} />
        ) : (
          <div className="w-[280px] min-w-[280px] bg-[#1a1a2e] flex items-center justify-center text-gray-600">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}

export default CouplePage;
