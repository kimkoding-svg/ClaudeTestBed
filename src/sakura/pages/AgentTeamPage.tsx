import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AgentCard } from '../components/AgentTeam/AgentCard';
import { ControlPanel } from '../components/AgentTeam/ControlPanel';
import { EventTimeline } from '../components/AgentTeam/EventTimeline';
import { FinancialDashboard } from '../components/AgentTeam/FinancialDashboard';
import { TokenDashboard } from '../components/AgentTeam/TokenDashboard';
import { JobDetailModal } from '../components/AgentTeam/JobDetailModal';
import { SimulationReport } from '../components/AgentTeam/SimulationReport';
import { connectSSE } from '../services/agentApi';
import type { AgentState, FinancialState, CostState, SimulationEvent } from '../services/agentApi';

interface AgentTeamPageProps {
  onBack: () => void;
}

export function AgentTeamPage({ onBack }: AgentTeamPageProps) {
  const [simStatus, setSimStatus] = useState<'idle' | 'running' | 'paused' | 'stopped'>('idle');
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [finances, setFinances] = useState<FinancialState | null>(null);
  const [costs, setCosts] = useState<CostState | null>(null);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [tick, setTick] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [selectedJob, setSelectedJob] = useState<{ agentId: string; jobId: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const handleSSEEvent = useCallback((event: SimulationEvent) => {
    switch (event.type) {
      case 'state_update':
        if (event.agents) setAgents(event.agents);
        if (event.tick !== undefined) setTick(event.tick);
        if (event.status) setSimStatus(event.status as any);
        break;
      case 'financials_update':
        if (event.financials) setFinances(event.financials);
        break;
      case 'costs_update':
        if (event.costs) setCosts(event.costs);
        break;
      case 'tick':
        if (event.tick !== undefined) setTick(event.tick);
        break;
      case 'simulation_paused':
        setSimStatus('paused');
        break;
      case 'simulation_stopped':
        setSimStatus('stopped');
        break;
      case 'budget_exceeded':
        setSimStatus('paused');
        setEvents(prev => [...prev, event]);
        break;
      case 'bankrupt':
        setSimStatus('paused');
        setEvents(prev => [...prev, event]);
        break;
      default:
        // All meaningful events get added to the timeline
        setEvents(prev => [...prev.slice(-500), event]);
        break;
    }
  }, []);

  useEffect(() => {
    const es = connectSSE(handleSSEEvent);
    eventSourceRef.current = es;
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [handleSSEEvent]);

  const handleJobClick = (agentId: string, jobId: string) => {
    setSelectedJob({ agentId, jobId });
  };

  const handleStatusChange = (status: string) => {
    setSimStatus(status as any);
    if (status === 'stopped') {
      setAgents([]);
      setFinances(null);
      setCosts(null);
      setEvents([]);
      setTick(0);
    }
  };

  // Separate lead agent from workers for display
  const leadAgent = agents.find(a => a.id === 'lead');
  const workerAgents = agents.filter(a => a.id !== 'lead');

  return (
    <div className="h-screen bg-black text-orange-400 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-10 border-b border-orange-700/30 bg-black/90 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[10px] font-mono text-orange-600 hover:text-orange-400 tracking-wider uppercase"
          >
            ← BACK
          </button>
          <div className="w-px h-5 bg-orange-900/30" />
          <h1 className="text-[11px] font-mono text-orange-500 tracking-widest uppercase font-bold">
            AGENT TEAM SIMULATOR
          </h1>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-orange-700">
          <span>TICK: {tick}</span>
          <div className={`w-2 h-2 rounded-full ${
            simStatus === 'running' ? 'bg-green-500 animate-pulse' : simStatus === 'paused' ? 'bg-yellow-500' : 'bg-slate-600'
          }`} />
          <span className="uppercase">{simStatus}</span>
        </div>
      </div>

      {/* Main layout: 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — Control + Dashboards */}
        <div className="w-64 border-r border-orange-900/30 overflow-y-auto shrink-0 p-2 space-y-2">
          <ControlPanel
            simStatus={simStatus}
            onStatusChange={handleStatusChange}
            onShowReport={() => setShowReport(true)}
          />
          <FinancialDashboard finances={finances} tick={tick} />
          <TokenDashboard costs={costs} />
        </div>

        {/* Center — Agent grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {agents.length === 0 && simStatus === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-6xl mb-4 opacity-30">🤖</div>
              <h2 className="text-sm font-mono text-orange-500 tracking-widest uppercase mb-2">AGENT TEAM SIMULATOR</h2>
              <p className="text-[10px] font-mono text-orange-700 max-w-md leading-relaxed">
                A full-fidelity e-commerce business simulator powered by real Claude API calls.
                A lead agent (CEO) will dynamically spawn and retire worker agents based on business needs.
                Every decision has consequences — every cost has ripple effects.
              </p>
              <p className="text-[10px] font-mono text-orange-600 mt-4">
                Configure settings in the control panel and press START to begin.
              </p>
            </div>
          )}

          {agents.length === 0 && simStatus !== 'idle' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-orange-500 font-mono text-sm animate-pulse">
                Initializing agents...
              </div>
            </div>
          )}

          {agents.length > 0 && (
            <div className="space-y-4">
              {/* Lead agent (CEO) — prominent */}
              {leadAgent && (
                <div className="mb-4">
                  <div className="text-[9px] font-mono text-orange-600 tracking-widest uppercase mb-2">★ LEAD AGENT (CEO)</div>
                  <div className="max-w-sm">
                    <AgentCard agent={leadAgent} onJobClick={handleJobClick} />
                  </div>
                </div>
              )}

              {/* Worker agents grid */}
              {workerAgents.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-orange-600 tracking-widest uppercase mb-2">
                    TEAM ({workerAgents.length} agents)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {workerAgents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} onJobClick={handleJobClick} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar — Event timeline */}
        <div className="w-80 border-l border-orange-900/30 shrink-0 flex flex-col">
          <EventTimeline events={events} />
        </div>
      </div>

      {/* Overlays */}
      {selectedJob && (
        <JobDetailModal
          agentId={selectedJob.agentId}
          jobId={selectedJob.jobId}
          onClose={() => setSelectedJob(null)}
        />
      )}
      {showReport && (
        <SimulationReport onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

export default AgentTeamPage;
