interface LandingPageProps {
  onNavigate: (page: 'sakura' | 'social') => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl" />
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
      <div className="flex gap-8 relative z-10">
        {/* Sakura card */}
        <button
          onClick={() => onNavigate('sakura')}
          className="group w-72 bg-black/80 border border-pink-700/30 hover:border-pink-500/60 p-8 transition-all duration-300 hover:shadow-lg hover:shadow-pink-500/10 text-left"
        >
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">🌸</div>
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
          <div className="text-5xl mb-5 group-hover:scale-110 transition-transform">🏢</div>
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
