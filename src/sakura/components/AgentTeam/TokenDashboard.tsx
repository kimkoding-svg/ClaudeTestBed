import React from 'react';
import type { CostState } from '../../services/agentApi';

interface TokenDashboardProps {
  costs: CostState | null;
}

export function TokenDashboard({ costs }: TokenDashboardProps) {
  if (!costs) return null;

  const { totals, rates, agents, leadOverhead } = costs;
  const budgetPercent = Math.min(100, totals.budgetUsedPercent);

  return (
    <div className="bg-black/80 border border-orange-700/30 clip-corners-small backdrop-blur-sm">
      <div className="p-3 border-b border-orange-900/30">
        <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
          ⚡ CLAUDE API USAGE
        </h3>
      </div>

      {/* Totals */}
      <div className="p-3 space-y-2">
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-orange-600">Total Calls</span>
          <span className="text-orange-400">{totals.calls}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-orange-600">Input Tokens</span>
          <span className="text-orange-400">{totals.inputTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-orange-600">Output Tokens</span>
          <span className="text-orange-400">{totals.outputTokens.toLocaleString()}</span>
        </div>

        {/* Cost */}
        <div className="flex justify-between text-[10px] font-mono font-bold">
          <span className="text-orange-500">TOTAL COST</span>
          <span className={totals.budgetExceeded ? 'text-red-400' : 'text-orange-300'}>
            ${totals.cost.toFixed(4)}
          </span>
        </div>

        {/* Budget bar */}
        <div>
          <div className="flex justify-between text-[8px] font-mono text-orange-700 mb-1">
            <span>Budget</span>
            <span>${totals.budgetRemaining.toFixed(4)} remaining</span>
          </div>
          <div className="h-2 bg-orange-950/50 border border-orange-900/30 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                budgetPercent > 90 ? 'bg-red-500' : budgetPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="text-[8px] font-mono text-orange-700 mt-0.5 text-right">
            {budgetPercent.toFixed(1)}% used
          </div>
        </div>

        {/* Rates */}
        <div className="pt-2 border-t border-orange-900/30 space-y-1">
          <div className="flex justify-between text-[8px] font-mono">
            <span className="text-orange-700">Cost/Tick</span>
            <span className="text-orange-500">${rates.costPerTick.toFixed(5)}</span>
          </div>
          <div className="flex justify-between text-[8px] font-mono">
            <span className="text-orange-700">Projected/hr</span>
            <span className="text-orange-500">${rates.projectedPerHour.toFixed(3)}</span>
          </div>
        </div>

        {/* Lead overhead */}
        {leadOverhead.cost > 0 && (
          <div className="pt-2 border-t border-orange-900/30">
            <div className="flex justify-between text-[8px] font-mono">
              <span className="text-orange-700">CEO Overhead</span>
              <span className="text-orange-500">
                ${leadOverhead.cost.toFixed(4)} ({leadOverhead.percentOfTotal.toFixed(1)}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Per-agent table */}
      {agents.length > 0 && (
        <div className="border-t border-orange-900/30 p-3">
          <h4 className="text-[8px] font-mono text-orange-600 tracking-wider uppercase mb-2">PER AGENT</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {agents
              .sort((a, b) => b.cost - a.cost)
              .map(agent => (
                <div
                  key={agent.id}
                  className={`flex items-center justify-between text-[8px] font-mono p-1.5 bg-orange-950/20 border border-orange-900/20 clip-corners-small ${
                    agent.retired ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-orange-400 truncate">
                      {agent.id === 'lead' ? '★ ' : ''}{agent.name}
                      {agent.retired ? ' (ret)' : ''}
                    </span>
                  </div>
                  <div className="flex gap-2 text-orange-600 flex-shrink-0 ml-2">
                    <span>{agent.calls}c</span>
                    <span className="text-orange-400">${agent.cost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TokenDashboard;
