interface LandingPageProps {
  onNavigate: (page: 'sakura' | 'social' | 'couple' | 'assistant') => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      {/* Title */}
      <div className="text-center mb-12 relative z-10">
        <h1 className="text-2xl font-mono text-zinc-300 tracking-[0.3em] uppercase font-bold mb-2">
          AI COMPANION
        </h1>
        <p className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">
          Choose your experience
        </p>
      </div>

      {/* Cards */}
      <div className="flex gap-8 relative z-10 flex-wrap justify-center">
        {/* Sakura card */}
        <button
          onClick={() => onNavigate('sakura')}
          className="group w-72 bg-black/80 border border-pink-700/30 hover:border-pink-500/60 p-8 transition-all duration-300 hover:shadow-lg hover:shadow-pink-500/10 text-left"
        >
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">{'\uD83C\uDF38'}</div>
          <h2 className="text-sm font-mono text-pink-400 tracking-widest uppercase font-bold mb-3">
            SAKURA
          </h2>
          <p className="text-[9px] font-mono text-pink-700 leading-relaxed">
            AI companion with voice interface.
            Streaming conversation, personality modes,
            document analysis, real-time TTS, and an
            autonomous agent team simulator.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-500/50 rounded-full" />
            <span className="text-[8px] font-mono text-pink-500/50 tracking-wider uppercase">CHAT + AGENTS</span>
          </div>
        </button>

        {/* Social Office card */}
        <button
          onClick={() => onNavigate('social')}
          className="group w-72 bg-black/80 border border-teal-700/30 hover:border-teal-500/60 p-8 transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/10 text-left"
        >
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">{'\uD83C\uDFE2'}</div>
          <h2 className="text-sm font-mono text-teal-400 tracking-widest uppercase font-bold mb-3">
            SOCIAL OFFICE
          </h2>
          <p className="text-[9px] font-mono text-teal-700 leading-relaxed">
            Pixel art office simulation.
            Watch AI characters build relationships through
            daily encounters. Evolving personalities,
            office events, and god-mode control.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <div className="w-2 h-2 bg-teal-500/50 rounded-full" />
            <span className="text-[8px] font-mono text-teal-500/50 tracking-wider uppercase">SIMULATOR</span>
          </div>
        </button>

        {/* Couple Chat card */}
        <button
          onClick={() => onNavigate('couple')}
          className="group w-72 bg-black/80 border border-violet-700/30 hover:border-violet-500/60 p-8 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/10 text-left"
        >
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">{'\uD83D\uDCAC'}</div>
          <h2 className="text-sm font-mono text-violet-400 tracking-widest uppercase font-bold mb-3">
            COUPLE CHAT
          </h2>
          <p className="text-[9px] font-mono text-violet-700 leading-relaxed">
            Two random AI personalities meet
            in a WhatsApp-style chat. Watch them
            bond, clash, and get triggered. Evolving
            traits, moods, and sarcasm in real-time.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <div className="w-2 h-2 bg-violet-500/50 rounded-full" />
            <span className="text-[8px] font-mono text-violet-500/50 tracking-wider uppercase">AI CHAT</span>
          </div>
        </button>

        {/* AI Assistant card */}
        <button
          onClick={() => onNavigate('assistant')}
          className="group w-72 bg-black/80 border border-amber-700/30 hover:border-amber-500/60 p-8 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 text-left"
        >
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">{'\u2728'}</div>
          <h2 className="text-sm font-mono text-amber-400 tracking-widest uppercase font-bold mb-3">
            AI ASSISTANT
          </h2>
          <p className="text-[9px] font-mono text-amber-700 leading-relaxed">
            Your intelligent AI assistant.
            Powered by Claude for research, analysis,
            code generation, and creative tasks
            with tool-augmented capabilities.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-500/50 rounded-full" />
            <span className="text-[8px] font-mono text-amber-500/50 tracking-wider uppercase">ASSISTANT</span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center">
        <p className="text-[8px] font-mono text-zinc-800 tracking-widest uppercase">
          Powered by Claude API
        </p>
      </div>
    </div>
  );
}

export default LandingPage;
