interface AIAssistantPageProps {
  onBack: () => void;
}

export function AIAssistantPage({ onBack }: AIAssistantPageProps) {
  return (
    <div className="h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-amber-900/30">
        <button
          onClick={onBack}
          className="text-[10px] font-mono text-amber-600 hover:text-amber-400 tracking-widest uppercase transition-colors"
        >
          &larr; BACK
        </button>
        <h1 className="text-sm font-mono text-amber-400 tracking-widest uppercase font-bold">
          AI ASSISTANT
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase">
          Coming soon
        </p>
      </div>
    </div>
  );
}
