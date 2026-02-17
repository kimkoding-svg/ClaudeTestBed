import React, { useEffect, useState } from 'react';
import { getReport } from '../../services/agentApi';

interface SimulationReportProps {
  onClose: () => void;
}

export function SimulationReport({ onClose }: SimulationReportProps) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'agents' | 'financials' | 'timeline' | 'api_log'>('summary');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  useEffect(() => {
    getReport()
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-50">
        <div className="text-orange-500 font-mono animate-pulse text-sm">Generating report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-50">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm">Failed to generate report</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-orange-950/80 border border-orange-500/50 text-orange-400 font-mono text-xs clip-corners-small">
            Close
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'summary', label: 'SUMMARY' },
    { id: 'agents', label: 'AGENTS' },
    { id: 'financials', label: 'FINANCIALS' },
    { id: 'timeline', label: 'TIMELINE' },
    { id: 'api_log', label: 'API LOG' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1 overflow-hidden flex flex-col max-w-6xl mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-orange-700/30 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-sm font-mono font-bold text-orange-500 tracking-widest uppercase">
              📊 SIMULATION REPORT
            </h2>
            <p className="text-[10px] font-mono text-orange-600 mt-1">
              {report.summary?.totalTicks || 0} ticks | {report.summary?.activeWorkers || 0} active agents | ${report.summary?.totalApiCost?.toFixed(4) || '0.0000'} API cost
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-orange-600 hover:text-orange-400 font-mono text-sm px-3 py-1 hover:bg-orange-950/50 clip-corners-small"
          >
            [CLOSE]
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-orange-900/30 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[10px] font-mono tracking-wider uppercase transition-all ${
                activeTab === tab.id
                  ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-950/30'
                  : 'text-orange-700 hover:text-orange-500 hover:bg-orange-950/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'summary' && <SummaryTab report={report} />}
          {activeTab === 'agents' && <AgentsTab report={report} />}
          {activeTab === 'financials' && <FinancialsTab report={report} />}
          {activeTab === 'timeline' && <TimelineTab report={report} />}
          {activeTab === 'api_log' && <ApiLogTab report={report} expandedCall={expandedCall} setExpandedCall={setExpandedCall} />}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({ report }: { report: any }) {
  const s = report.summary || {};
  return (
    <div className="space-y-4">
      <Section title="OVERVIEW">
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Ticks" value={s.totalTicks || 0} />
          <StatBox label="Workers" value={s.activeWorkers || 0} />
          <StatBox label="Retired" value={s.retiredWorkers || 0} />
          <StatBox label="API Calls" value={s.totalApiCalls || 0} />
          <StatBox label="API Cost" value={`$${(s.totalApiCost || 0).toFixed(4)}`} />
          <StatBox label="Revenue" value={`$${(s.totalRevenue || 0).toFixed(2)}`} />
        </div>
      </Section>

      {report.businessMetrics && (
        <Section title="BUSINESS METRICS">
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Cash Remaining" value={`$${(report.businessMetrics.cash || 0).toLocaleString()}`} />
            <StatBox label="Total Revenue" value={`$${(report.businessMetrics.revenue || 0).toFixed(2)}`} />
            <StatBox label="Total Expenses" value={`$${(report.businessMetrics.expenses || 0).toFixed(2)}`} />
            <StatBox label="Orders Shipped" value={report.businessMetrics.ordersShipped || 0} />
            <StatBox label="Customer Sat." value={`${report.businessMetrics.satisfaction || 0}%`} />
            <StatBox label="Overall Morale" value={`${report.businessMetrics.morale || 0}%`} />
          </div>
        </Section>
      )}

      {s.ceoDecisions && s.ceoDecisions.length > 0 && (
        <Section title="CEO DECISIONS">
          <div className="space-y-2">
            {s.ceoDecisions.map((d: any, i: number) => (
              <div key={i} className="p-2 bg-orange-950/20 border border-orange-900/20 clip-corners-small">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 border border-orange-700/30 text-orange-500 uppercase">{d.type}</span>
                  <span className="text-[9px] font-mono text-orange-300">{d.summary || d.justification}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function AgentsTab({ report }: { report: any }) {
  const agents = report.agents || [];
  return (
    <div className="space-y-3">
      {agents.length === 0 ? (
        <p className="text-[10px] font-mono text-orange-700 text-center py-8">No agent data</p>
      ) : (
        agents.map((agent: any) => (
          <div key={agent.id} className={`p-3 bg-orange-950/20 border border-orange-900/30 clip-corners-small ${agent.retired ? 'opacity-60' : ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xs font-mono font-bold text-orange-400">
                  {agent.id === 'lead' ? '★ ' : ''}{agent.name} {agent.retired ? '(RETIRED)' : ''}
                </h4>
                <p className="text-[9px] font-mono text-orange-600">{agent.role} — ${agent.hourlyRate}/hr</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono text-orange-400">${(agent.apiCost || 0).toFixed(4)} API</p>
                <p className="text-[9px] font-mono text-orange-600">{agent.calls || 0} calls</p>
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-[8px] font-mono text-orange-700">
              <span>Jobs: {agent.jobsCompleted || 0}</span>
              <span>Social: {agent.socialInteractions || 0}</span>
              <span>Input: {(agent.inputTokens || 0).toLocaleString()} tok</span>
              <span>Output: {(agent.outputTokens || 0).toLocaleString()} tok</span>
            </div>
            {agent.personality && (
              <p className="text-[8px] font-mono text-orange-800 mt-1 italic">
                {agent.personality.traits?.join(', ')}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function FinancialsTab({ report }: { report: any }) {
  const fin = report.financials || {};
  const snapshots = fin.snapshots || [];

  return (
    <div className="space-y-4">
      <Section title="FINAL STATE">
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Cash" value={`$${(fin.cashRemaining || 0).toLocaleString()}`} />
          <StatBox label="Burn/Min" value={`$${(fin.burnRatePerMin || 0).toFixed(4)}`} />
          <StatBox label="Revenue/Min" value={`$${(fin.revenuePerMin || 0).toFixed(4)}`} />
        </div>
      </Section>

      {fin.payrollBreakdown && (
        <Section title="PAYROLL BREAKDOWN">
          <div className="space-y-1">
            {Object.entries(fin.payrollBreakdown).map(([name, rate]: [string, any]) => (
              <div key={name} className="flex justify-between text-[9px] font-mono">
                <span className="text-orange-600">{name}</span>
                <span className="text-orange-400">${rate.toFixed(4)}/min</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {snapshots.length > 0 && (
        <Section title="CASH HISTORY">
          <div className="h-32 flex items-end gap-px">
            {snapshots.slice(-60).map((snap: any, i: number) => {
              const maxCash = Math.max(...snapshots.map((s: any) => s.cash || 0));
              const height = maxCash > 0 ? ((snap.cash || 0) / maxCash) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-orange-500/60 hover:bg-orange-400/80 transition-colors"
                  style={{ height: `${height}%` }}
                  title={`Tick ${snap.tick}: $${(snap.cash || 0).toLocaleString()}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[7px] font-mono text-orange-800 mt-1">
            <span>Tick {snapshots[Math.max(0, snapshots.length - 60)]?.tick || 0}</span>
            <span>Tick {snapshots[snapshots.length - 1]?.tick || 0}</span>
          </div>
        </Section>
      )}
    </div>
  );
}

function TimelineTab({ report }: { report: any }) {
  const timeline = report.timeline || [];
  return (
    <div className="space-y-1">
      {timeline.length === 0 ? (
        <p className="text-[10px] font-mono text-orange-700 text-center py-8">No timeline events</p>
      ) : (
        timeline.slice(-200).map((event: any, i: number) => (
          <div key={i} className="p-2 bg-orange-950/10 border border-orange-900/15 clip-corners-small">
            <div className="flex items-start gap-2 text-[9px] font-mono">
              <span className="text-orange-700 shrink-0 w-16">T{event.tick || '?'}</span>
              <span className="text-orange-500 shrink-0 w-24 uppercase">{event.type}</span>
              <span className="text-orange-300 break-words">
                {event.message || event.description || event.task || event.name || JSON.stringify(event).slice(0, 120)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ApiLogTab({ report, expandedCall, setExpandedCall }: { report: any; expandedCall: string | null; setExpandedCall: (id: string | null) => void }) {
  const calls = report.apiLog || [];
  return (
    <div className="space-y-1">
      <div className="text-[9px] font-mono text-orange-600 mb-2">{calls.length} API calls logged</div>
      {calls.length === 0 ? (
        <p className="text-[10px] font-mono text-orange-700 text-center py-8">No API calls logged</p>
      ) : (
        calls.map((call: any) => (
          <div key={call.id} className="border border-orange-900/20 clip-corners-small">
            <button
              onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              className="w-full text-left p-2 hover:bg-orange-950/30 transition-all"
            >
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="text-orange-700 w-8">T{call.tick || '?'}</span>
                <span className="text-orange-500 w-20">{call.agentName || call.agentId}</span>
                <span className="text-orange-600 w-12">{call.type || 'biz'}</span>
                <span className="text-orange-300 flex-1 truncate">{call.task || '—'}</span>
                <span className="text-orange-700">{(call.inputTokens || 0).toLocaleString()}→{(call.outputTokens || 0).toLocaleString()}</span>
                <span className="text-orange-500">${(call.cost || 0).toFixed(5)}</span>
              </div>
            </button>
            {expandedCall === call.id && (
              <div className="border-t border-orange-900/20 p-3 space-y-3">
                <div>
                  <h5 className="text-[8px] font-mono text-blue-600 tracking-wider uppercase mb-1">INPUT PROMPT</h5>
                  <div className="bg-blue-950/20 border border-blue-700/20 p-2 clip-corners-small max-h-48 overflow-y-auto">
                    <pre className="text-[8px] font-mono text-blue-300 whitespace-pre-wrap break-words">
                      {call.inputPrompt || '(not captured)'}
                    </pre>
                  </div>
                </div>
                <div>
                  <h5 className="text-[8px] font-mono text-green-600 tracking-wider uppercase mb-1">OUTPUT RESPONSE</h5>
                  <div className="bg-green-950/20 border border-green-700/20 p-2 clip-corners-small max-h-48 overflow-y-auto">
                    <pre className="text-[8px] font-mono text-green-300 whitespace-pre-wrap break-words">
                      {call.outputResponse || '(not captured)'}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-mono text-orange-600 tracking-widest uppercase mb-2 pb-1 border-b border-orange-900/30">{title}</h4>
      {children}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-orange-950/30 border border-orange-900/20 p-2 clip-corners-small">
      <div className="text-[8px] font-mono text-orange-600 tracking-wider uppercase">{label}</div>
      <div className="text-xs font-mono font-bold text-orange-400 mt-0.5">{value}</div>
    </div>
  );
}

export default SimulationReport;
