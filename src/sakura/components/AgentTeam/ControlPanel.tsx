import { useState } from 'react';
import {
  startSimulation, pauseSimulation, resumeSimulation, stopSimulation,
  injectEvent, updateSettings,
} from '../../services/agentApi';

interface ControlPanelProps {
  simStatus: 'idle' | 'running' | 'paused' | 'stopped';
  onStatusChange: (status: string) => void;
  onShowReport: () => void;
}

const PRESET_EVENTS: { name: string; description: string; severity: string; impact: Record<string, number> }[] = [
  { name: 'Order Spike', description: 'Sudden 3x increase in orders', severity: 'high', impact: { orders_pending: 50, satisfaction: 5 } },
  { name: 'Supplier Delay', description: 'Key supplier delayed by 3 days', severity: 'medium', impact: { restock_delay: 3 } },
  { name: 'Bad Review Viral', description: 'A negative review goes viral on social media', severity: 'high', impact: { satisfaction: -15, rating: -0.5 } },
  { name: 'Competitor Sale', description: 'Major competitor launches a 50% off sale', severity: 'medium', impact: { sales_velocity: -0.3 } },
  { name: 'Server Outage', description: 'E-commerce platform down for 2 hours', severity: 'critical', impact: { revenue_loss_hours: 2 } },
  { name: 'Influencer Mention', description: 'Popular TikTok influencer features our product', severity: 'positive', impact: { tiktok_boost: 5, satisfaction: 10 } },
  { name: 'Staff Complaint', description: 'Anonymous complaint about overwork posted on Glassdoor', severity: 'medium', impact: { morale: -10 } },
  { name: 'Tax Audit', description: 'Company flagged for tax audit — needs documentation', severity: 'high', impact: { admin_overhead: 20 } },
];

export function ControlPanel({ simStatus, onStatusChange, onShowReport }: ControlPanelProps) {
  const [budgetCap, setBudgetCap] = useState(1.0);
  const [startingCash, setStartingCash] = useState(500000);
  const [tickSpeed, setTickSpeed] = useState(3000);
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [companyName, setCompanyName] = useState('NovaCraft E-Commerce');
  const [showEvents, setShowEvents] = useState(false);
  const [injecting, setInjecting] = useState(false);

  const handleStart = async () => {
    await startSimulation({ budgetCap, startingCash, model, tickSpeed, companyName });
    onStatusChange('running');
  };

  const handlePause = async () => {
    await pauseSimulation();
    onStatusChange('paused');
  };

  const handleResume = async () => {
    await resumeSimulation();
    onStatusChange('running');
  };

  const handleStop = async () => {
    await stopSimulation();
    onStatusChange('stopped');
  };

  const handleInject = async (event: typeof PRESET_EVENTS[0]) => {
    setInjecting(true);
    await injectEvent(event);
    setInjecting(false);
    setShowEvents(false);
  };

  const handleSettingsChange = async (key: string, value: number | string) => {
    await updateSettings({ [key]: value });
  };

  const isRunning = simStatus === 'running';
  const isPaused = simStatus === 'paused';
  const isIdle = simStatus === 'idle' || simStatus === 'stopped';

  return (
    <div className="bg-black/80 border border-orange-700/30 clip-corners-small backdrop-blur-sm">
      <div className="p-3 border-b border-orange-900/30">
        <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
          🎮 CONTROL PANEL
        </h3>
      </div>

      <div className="p-3 space-y-3">
        {/* Sim controls */}
        <div className="flex gap-2">
          {isIdle && (
            <button
              onClick={handleStart}
              className="flex-1 py-2 px-3 bg-green-950/60 border border-green-500/50 text-green-400 font-mono text-[10px] tracking-wider uppercase hover:bg-green-900/40 transition-all clip-corners-small"
            >
              ▶ START
            </button>
          )}
          {isRunning && (
            <button
              onClick={handlePause}
              className="flex-1 py-2 px-3 bg-yellow-950/60 border border-yellow-500/50 text-yellow-400 font-mono text-[10px] tracking-wider uppercase hover:bg-yellow-900/40 transition-all clip-corners-small"
            >
              ⏸ PAUSE
            </button>
          )}
          {isPaused && (
            <>
              <button
                onClick={handleResume}
                className="flex-1 py-2 px-3 bg-green-950/60 border border-green-500/50 text-green-400 font-mono text-[10px] tracking-wider uppercase hover:bg-green-900/40 transition-all clip-corners-small"
              >
                ▶ RESUME
              </button>
              <button
                onClick={onShowReport}
                className="flex-1 py-2 px-3 bg-blue-950/60 border border-blue-500/50 text-blue-400 font-mono text-[10px] tracking-wider uppercase hover:bg-blue-900/40 transition-all clip-corners-small"
              >
                📊 REPORT
              </button>
            </>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={handleStop}
              className="py-2 px-3 bg-red-950/60 border border-red-500/50 text-red-400 font-mono text-[10px] tracking-wider uppercase hover:bg-red-900/40 transition-all clip-corners-small"
            >
              ⏹
            </button>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <div className={`w-2 h-2 rounded-full ${
            isRunning ? 'bg-green-500 animate-pulse' : isPaused ? 'bg-yellow-500' : 'bg-slate-600'
          }`} />
          <span className="text-orange-500 uppercase tracking-wider">{simStatus}</span>
        </div>

        {/* Config (only when idle) */}
        {isIdle && (
          <div className="space-y-2 pt-2 border-t border-orange-900/30">
            <ConfigRow label="Company">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-orange-950/40 border border-orange-700/30 text-orange-300 font-mono text-[9px] px-2 py-1 w-full"
              />
            </ConfigRow>
            <ConfigRow label="Starting $">
              <input
                type="number"
                value={startingCash}
                onChange={(e) => setStartingCash(Number(e.target.value))}
                className="bg-orange-950/40 border border-orange-700/30 text-orange-300 font-mono text-[9px] px-2 py-1 w-20"
              />
            </ConfigRow>
            <ConfigRow label="API Budget">
              <input
                type="number"
                step="0.25"
                value={budgetCap}
                onChange={(e) => setBudgetCap(Number(e.target.value))}
                className="bg-orange-950/40 border border-orange-700/30 text-orange-300 font-mono text-[9px] px-2 py-1 w-20"
              />
            </ConfigRow>
            <ConfigRow label="Model">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-orange-950/40 border border-orange-700/30 text-orange-300 font-mono text-[9px] px-2 py-1"
              >
                <option value="claude-haiku-4-5-20251001">Haiku ($0.80/$4)</option>
                <option value="claude-sonnet-4-5-20250929">Sonnet ($3/$15)</option>
              </select>
            </ConfigRow>
            <ConfigRow label="Tick Speed">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={tickSpeed}
                  onChange={(e) => setTickSpeed(Number(e.target.value))}
                  className="flex-1 accent-orange-500"
                />
                <span className="text-[8px] font-mono text-orange-600 w-12">{(tickSpeed / 1000).toFixed(1)}s</span>
              </div>
            </ConfigRow>
          </div>
        )}

        {/* Live settings (when running) */}
        {(isRunning || isPaused) && (
          <div className="space-y-2 pt-2 border-t border-orange-900/30">
            <ConfigRow label="Speed">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={tickSpeed}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTickSpeed(v);
                    handleSettingsChange('tickSpeed', v);
                  }}
                  className="flex-1 accent-orange-500"
                />
                <span className="text-[8px] font-mono text-orange-600 w-12">{(tickSpeed / 1000).toFixed(1)}s</span>
              </div>
            </ConfigRow>
            <ConfigRow label="Budget">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-mono text-orange-600">$</span>
                <input
                  type="number"
                  step="0.25"
                  value={budgetCap}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBudgetCap(v);
                    handleSettingsChange('budgetCap', v);
                  }}
                  className="bg-orange-950/40 border border-orange-700/30 text-orange-300 font-mono text-[9px] px-2 py-1 w-16"
                />
              </div>
            </ConfigRow>
          </div>
        )}

        {/* Event injection */}
        {(isRunning || isPaused) && (
          <div className="pt-2 border-t border-orange-900/30">
            <button
              onClick={() => setShowEvents(!showEvents)}
              className="w-full text-left text-[9px] font-mono text-orange-600 hover:text-orange-400 tracking-wider uppercase flex items-center justify-between"
            >
              <span>⚡ INJECT EVENT</span>
              <span>{showEvents ? '▴' : '▾'}</span>
            </button>
            {showEvents && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {PRESET_EVENTS.map((event) => (
                  <button
                    key={event.name}
                    onClick={() => handleInject(event)}
                    disabled={injecting}
                    className="w-full text-left p-2 bg-orange-950/20 hover:bg-orange-950/40 border border-orange-900/20 hover:border-orange-700/40 transition-all clip-corners-small disabled:opacity-50"
                  >
                    <div className="text-[9px] font-mono text-orange-400">{event.name}</div>
                    <div className="text-[8px] font-mono text-orange-700">{event.description}</div>
                    <div className="flex gap-2 mt-0.5">
                      <span className={`text-[7px] font-mono px-1 border ${
                        event.severity === 'critical' ? 'text-red-400 border-red-700/30'
                          : event.severity === 'high' ? 'text-orange-400 border-orange-700/30'
                          : event.severity === 'positive' ? 'text-green-400 border-green-700/30'
                          : 'text-yellow-400 border-yellow-700/30'
                      }`}>
                        {event.severity}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[9px] font-mono text-orange-600 tracking-wider uppercase shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default ControlPanel;
