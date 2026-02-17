import { useState } from 'react';
import { PixelAvatar } from './PixelAvatar';
import type { AgentState } from '../../services/agentApi';

interface AgentCardProps {
  agent: AgentState;
  onJobClick: (agentId: string, jobId: string) => void;
}

export function AgentCard({ agent, onJobClick }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);

  const activeJobs = agent.recentJobs.filter(j => j.status === 'in_progress').length;
  const doneJobs = agent.stats.jobsCompleted;
  const perMinute = (agent.hourlyRate / 60).toFixed(2);

  return (
    <div className="bg-black/80 border border-orange-700/30 hover:border-orange-500/50 transition-all duration-200 clip-corners-small backdrop-blur-sm">
      {/* Header */}
      <div className="p-3 flex items-start gap-3">
        <PixelAvatar
          role={agent.role}
          status={agent.status}
          size={5}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between">
            <h4 className="font-mono text-xs font-bold text-orange-400 tracking-wider uppercase truncate">
              {agent.name}
            </h4>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-[10px] font-mono text-orange-600/70 tracking-wider uppercase truncate">
            {agent.role}
          </p>
          <div className="flex gap-3 mt-1 text-[9px] font-mono text-orange-700/60">
            <span>${perMinute}/min</span>
            <span>{agent.skills.slice(0, 2).join(', ')}</span>
          </div>
        </div>
      </div>

      {/* Current task */}
      {agent.currentJob && (
        <div className="px-3 pb-2">
          <div className="bg-yellow-950/30 border border-yellow-700/30 p-2 clip-corners-small">
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-yellow-500">
              <span className="animate-pulse">⏳</span>
              <span className="truncate">{agent.currentJob.task}</span>
            </div>
            <div className="text-[8px] font-mono text-yellow-700 mt-0.5">
              {Math.round(agent.currentJob.elapsed / 1000)}s elapsed
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="px-3 pb-2 flex justify-between text-[9px] font-mono">
        <span className="text-green-600">{doneJobs} done</span>
        <span className="text-orange-600">{agent.stats.socialInteractions} chats</span>
        <span className="text-orange-500">{agent.model.includes('haiku') ? 'H' : 'S'}</span>
      </div>

      {/* Jobs list (collapsible) */}
      <div className="border-t border-orange-900/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-1.5 flex items-center justify-between text-[9px] font-mono text-orange-600 hover:text-orange-400 hover:bg-orange-950/30 transition-all"
        >
          <span>Jobs: {activeJobs} active, {doneJobs} done</span>
          <span>{expanded ? '▴' : '▾'}</span>
        </button>

        {expanded && (
          <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
            {agent.recentJobs.length === 0 ? (
              <p className="text-[9px] font-mono text-orange-800 py-2 text-center">No jobs yet</p>
            ) : (
              agent.recentJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => onJobClick(agent.id, job.id)}
                  className="w-full text-left p-1.5 bg-orange-950/20 hover:bg-orange-950/40 border border-orange-900/20 hover:border-orange-700/40 transition-all clip-corners-small"
                >
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span>{job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏳'}</span>
                    <span className="text-orange-400 truncate flex-1">{job.task}</span>
                  </div>
                  <div className="flex gap-3 mt-0.5 text-[8px] font-mono text-orange-700">
                    {job.duration && <span>{Math.round(job.duration / 1000)}s</span>}
                    {job.cost !== undefined && <span>${job.cost.toFixed(4)}</span>}
                  </div>
                </button>
              ))
            )}
            {agent.totalJobs > 5 && (
              <p className="text-[8px] font-mono text-orange-700 text-center py-1">
                {agent.totalJobs - 5} more jobs...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'text-slate-500 bg-slate-950/50 border-slate-700/30',
    thinking: 'text-yellow-400 bg-yellow-950/50 border-yellow-700/30',
    acting: 'text-green-400 bg-green-950/50 border-green-700/30',
    waiting: 'text-blue-400 bg-blue-950/50 border-blue-700/30',
    blocked: 'text-red-400 bg-red-950/50 border-red-700/30',
  };

  return (
    <span className={`text-[8px] font-mono px-1.5 py-0.5 border uppercase tracking-wider ${colors[status] || colors.idle}`}>
      {status}
    </span>
  );
}

export default AgentCard;
