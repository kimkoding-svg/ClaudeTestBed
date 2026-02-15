import React, { useEffect, useState } from 'react';
import { VoiceButton } from './components/VoiceInterface/VoiceButton';
import { WaveformVisualizer } from './components/VoiceInterface/WaveformVisualizer';
import { useVoiceRecording } from './hooks/useVoiceRecording';

function App() {
  const [version, setVersion] = useState<string>('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [inputText, setInputText] = useState('');

  const { isRecording, volume } = useVoiceRecording();

  useEffect(() => {
    // Test IPC communication
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(v => setVersion(v));
    }
  }, []);

  const handleVoiceTranscript = (text: string) => {
    console.log('Voice transcript:', text);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    // TODO: Send to LLM for processing
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: inputText }]);
    setInputText('');
    // TODO: Send to LLM for processing
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">AI Companion</h1>
          <p className="text-xs text-gray-500 mt-1">v{version || '0.1.0'}</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            💬 Chat
          </button>
          <button className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            🧠 Memories
          </button>
          <button className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            🔧 Settings
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Ready</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-800">Welcome</h2>
          <p className="text-sm text-gray-600">Your AI companion is ready to chat</p>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-2">Getting Started</h3>
                <p className="text-gray-600 mb-4">
                  Welcome to AI Companion! This is your personal AI assistant with persistent memory.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <span className="mr-2">🎤</span>
                    <span>Click the microphone button to start voice conversation</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">💭</span>
                    <span>Type messages in the chat box below</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">🧠</span>
                    <span>Your companion will remember important details about you</span>
                  </li>
                </ul>
              </div>
            )}

            {/* Messages */}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-800 border border-gray-200'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <footer className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Waveform Visualizer */}
            <WaveformVisualizer
              isActive={isRecording}
              volume={volume}
            />

            {/* Input Controls */}
            <div className="flex items-center space-x-3">
              <VoiceButton
                onTranscript={handleVoiceTranscript}
                onError={(error) => console.error('Voice error:', error)}
              />
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isRecording}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isRecording}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
