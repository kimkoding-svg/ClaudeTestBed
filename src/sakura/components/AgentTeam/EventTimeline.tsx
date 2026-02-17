import React, { useEffect, useRef } from 'react';
import type { SimulationEvent } from '../../services/agentApi';

interface EventTimelineProps {
  events: SimulationEvent[];
  maxVisible?: number;
}

function formatTime(tick: number): string {
  const hour = Math.floor((tick % 1440) / 60) + 9;
  const min = tick % 60;
  const day = Math.floor(tick / 1440) + 1;
  return `D${day} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function getEventIcon(type: string): string {
  switch (type) {
    case 'social_chat': return '💬';
    case 'agent_hired': return '🟢';
    case 'agent_fired': case 'agent_retired': return '🔴';
    case 'task_assigned': return '📋';
    case 'task_completed': return '✅';
    case 'task_failed': return '❌';
    case 'campaign_result': return '📈';
    case 'sale': case 'organic_sale': return '💵';
    case 'random_event': case 'injected_event': return '⚡';
    case 'lead_evaluation': return '🧠';
    case 'morale_change': return '😊';
    case 'bankrupt': return '💀';
    case 'budget_exceeded': return '🚫';
    case 'restock': return '📦';
    case 'tick': return '⏱';
    default: return '▸';
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case 'social_chat': return 'border-blue-700/30 bg-blue-950/20';
    case 'agent_hired': return 'border-green-700/30 bg-green-950/20';
    case 'agent_fired': case 'agent_retired': return 'border-red-700/30 bg-red-950/20';
    case 'campaign_result': return 'border-purple-700/30 bg-purple-950/20';
    case 'sale': case 'organic_sale': return 'border-green-700/30 bg-green-950/20';
    case 'random_event': case 'injected_event': return 'border-yellow-700/30 bg-yellow-950/20';
    case 'lead_evaluation': return 'border-orange-700/30 bg-orange-950/20';
    case 'bankrupt': case 'budget_exceeded': return 'border-red-700/50 bg-red-950/30';
    case 'task_failed': return 'border-red-700/30 bg-red-950/20';
    default: return 'border-orange-900/20 bg-orange-950/10';
  }
}

function getEventTextColor(type: string): string {
  switch (type) {
    case 'social_chat': return 'text-blue-300';
    case 'agent_hired': return 'text-green-300';
    case 'agent_fired': case 'agent_retired': return 'text-red-300';
    case 'campaign_result': return 'text-purple-300';
    case 'sale': case 'organic_sale': return 'text-green-300';
    case 'random_event': case 'injected_event': return 'text-yellow-300';
    case 'bankrupt': case 'budget_exceeded': return 'text-red-400';
    default: return 'text-orange-300';
  }
}

function renderEventContent(event: SimulationEvent): React.ReactNode {
  switch (event.type) {
    case 'social_chat':
      return (
        <div>
          <span className="text-blue-400 font-bold">{event.from}</span>
          <span className="text-blue-600"> → </span>
          <span className="text-blue-400 font-bold">{event.to}</span>
          <p className="text-blue-200 mt-0.5 italic">"{event.message}"</p>
        </div>
      );
    case 'agent_hired':
      return (
        <span>
          Hired <span className="text-green-400 font-bold">{event.name}</span> as {event.role}
          {event.hourlyRate && <span className="text-green-600"> (${event.hourlyRate}/hr)</span>}
        </span>
      );
    case 'agent_fired':
    case 'agent_retired':
      return (
        <span>
          Retired <span className="text-red-400 font-bold">{event.name}</span>
          {event.reason && <span className="text-red-600"> — {event.reason}</span>}
        </span>
      );
    case 'task_assigned':
      return (
        <span>
          <span className="text-orange-400">{event.agentName}</span>: {event.task}
        </span>
      );
    case 'task_completed':
      return (
        <span>
          <span className="text-green-400">{event.agentName}</span> completed: {event.task}
          {event.cost !== undefined && <span className="text-orange-600"> (${event.cost.toFixed(4)})</span>}
        </span>
      );
    case 'task_failed':
      return (
        <span>
          <span className="text-red-400">{event.agentName}</span> failed: {event.task}
          {event.error && <span className="text-red-600"> — {event.error}</span>}
        </span>
      );
    case 'campaign_result':
      return (
        <span>
          Campaign on <span className="text-purple-400">{event.channel}</span>:
          {event.conversions} sales, ${event.revenue?.toFixed(2)} rev, ROI {event.roi?.toFixed(1)}x
        </span>
      );
    case 'sale':
    case 'organic_sale':
      return (
        <span>
          Sold <span className="text-green-400">{event.product}</span> — ${event.profit?.toFixed(2)} profit
        </span>
      );
    case 'random_event':
    case 'injected_event':
      return (
        <span>
          <span className="text-yellow-400 font-bold">{event.name}</span>: {event.description}
        </span>
      );
    case 'lead_evaluation':
      return (
        <span>
          CEO: {event.analysis || event.message || 'Evaluating business state...'}
        </span>
      );
    case 'bankrupt':
      return <span className="font-bold">COMPANY BANKRUPT — Cash depleted!</span>;
    case 'budget_exceeded':
      return <span className="font-bold">API BUDGET EXCEEDED — Simulation paused</span>;
    default:
      return <span>{event.message || event.description || JSON.stringify(event)}</span>;
  }
}

export function EventTimeline({ events, maxVisible = 100 }: EventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    if (scrollRef.current && isAtBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  // Filter out noisy tick events, only show meaningful ones
  const filtered = events
    .filter(e => e.type !== 'tick' && e.type !== 'costs_update' && e.type !== 'state_update' && e.type !== 'financials_update')
    .slice(-maxVisible);

  return (
    <div className="bg-black/80 border border-orange-700/30 clip-corners-small backdrop-blur-sm flex flex-col h-full">
      <div className="p-3 border-b border-orange-900/30 flex items-center justify-between">
        <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
          📜 EVENT LOG
        </h3>
        <span className="text-[8px] font-mono text-orange-700">{filtered.length} events</span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0"
      >
        {filtered.length === 0 ? (
          <div className="text-[9px] font-mono text-orange-800 text-center py-8">
            No events yet — start the simulation
          </div>
        ) : (
          filtered.map((event, i) => (
            <div
              key={`${event.tick || 0}-${event.type}-${i}`}
              className={`p-2 border clip-corners-small ${getEventColor(event.type)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] shrink-0">{getEventIcon(event.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[9px] font-mono ${getEventTextColor(event.type)} break-words`}>
                    {renderEventContent(event)}
                  </div>
                  {event.tick !== undefined && (
                    <div className="text-[7px] font-mono text-orange-800 mt-0.5">
                      {formatTime(event.tick)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EventTimeline;
