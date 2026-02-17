import { useEffect, useState } from 'react';
import { getJobDetail, type JobDetail } from '../../services/agentApi';

interface JobDetailModalProps {
  agentId: string;
  jobId: string;
  onClose: () => void;
}

export function JobDetailModal({ agentId, jobId, onClose }: JobDetailModalProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  useEffect(() => {
    getJobDetail(agentId, jobId)
      .then(setJob)
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [agentId, jobId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50">
        <div className="text-orange-500 font-mono animate-pulse">Loading job details...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50">
        <div className="bg-black/90 border border-red-500/50 p-6 clip-corners">
          <p className="text-red-400 font-mono text-sm">Job not found</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-orange-950/80 border border-orange-500/50 text-orange-400 font-mono text-xs clip-corners-small">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-black/95 border border-orange-500/50 shadow-2xl shadow-orange-500/20 clip-corners w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-orange-900/50 flex justify-between items-start">
          <div>
            <h3 className="text-sm font-mono font-bold text-orange-500 tracking-wider uppercase">
              JOB DETAIL
            </h3>
            <p className="text-xs font-mono text-orange-400 mt-1">{job.task}</p>
          </div>
          <button
            onClick={onClose}
            className="text-orange-600 hover:text-orange-400 font-mono text-sm px-2 py-1 hover:bg-orange-950/50 clip-corners-small"
          >
            [X]
          </button>
        </div>

        {/* Metadata */}
        <div className="p-4 grid grid-cols-3 gap-3">
          <MetricBox label="STATUS" value={job.status} color={job.status === 'completed' ? 'green' : 'red'} />
          <MetricBox label="DURATION" value={`${Math.round((job.duration || 0) / 1000)}s`} />
          <MetricBox label="COST" value={`$${(job.cost || 0).toFixed(4)}`} />
          <MetricBox label="INPUT TOK" value={job.inputTokens?.toLocaleString() || '0'} />
          <MetricBox label="OUTPUT TOK" value={job.outputTokens?.toLocaleString() || '0'} />
          <MetricBox label="ASSIGNED BY" value={job.assignedBy || 'lead'} />
        </div>

        {/* Result */}
        {job.result && (
          <div className="px-4 pb-3">
            <h4 className="text-[10px] font-mono text-orange-600 tracking-wider uppercase mb-2">AGENT RESPONSE</h4>
            <div className="bg-orange-950/30 border border-orange-700/20 p-3 clip-corners-small">
              <pre className="text-[10px] font-mono text-orange-300 whitespace-pre-wrap break-words">
                {typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Full prompt (expandable) */}
        {job.fullPrompt && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-[10px] font-mono text-orange-600 hover:text-orange-400 tracking-wider uppercase flex items-center gap-1"
            >
              {showPrompt ? '▴' : '▾'} FULL INPUT PROMPT ({job.inputTokens} tokens)
            </button>
            {showPrompt && (
              <div className="mt-2 bg-blue-950/20 border border-blue-700/20 p-3 clip-corners-small max-h-60 overflow-y-auto">
                <pre className="text-[9px] font-mono text-blue-300 whitespace-pre-wrap break-words">
                  {job.fullPrompt}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Full response (expandable) */}
        {job.fullResponse && (
          <div className="px-4 pb-4">
            <button
              onClick={() => setShowResponse(!showResponse)}
              className="text-[10px] font-mono text-orange-600 hover:text-orange-400 tracking-wider uppercase flex items-center gap-1"
            >
              {showResponse ? '▴' : '▾'} FULL OUTPUT RESPONSE ({job.outputTokens} tokens)
            </button>
            {showResponse && (
              <div className="mt-2 bg-green-950/20 border border-green-700/20 p-3 clip-corners-small max-h-60 overflow-y-auto">
                <pre className="text-[9px] font-mono text-green-300 whitespace-pre-wrap break-words">
                  {job.fullResponse}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {job.error && (
          <div className="px-4 pb-4">
            <div className="bg-red-950/30 border border-red-700/30 p-3 clip-corners-small">
              <p className="text-[10px] font-mono text-red-400">{job.error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'green' ? 'text-green-400 border-green-700/30'
    : color === 'red' ? 'text-red-400 border-red-700/30'
    : 'text-orange-400 border-orange-700/30';

  return (
    <div className={`bg-orange-950/30 border p-2 clip-corners-small ${colorClass}`}>
      <div className="text-[8px] font-mono text-orange-600 tracking-wider uppercase">{label}</div>
      <div className={`text-xs font-mono font-bold mt-0.5 ${colorClass.split(' ')[0]}`}>{value}</div>
    </div>
  );
}

export default JobDetailModal;
