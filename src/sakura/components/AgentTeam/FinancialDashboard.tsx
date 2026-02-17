import React from 'react';
import type { FinancialState } from '../../services/agentApi';

interface FinancialDashboardProps {
  finances: FinancialState | null;
  tick: number;
}

export function FinancialDashboard({ finances, tick }: FinancialDashboardProps) {
  if (!finances) return null;

  const {
    cashRemaining, burnRatePerMin, payrollPerMin, facilitiesPerMin,
    marketingPerMin, revenuePerMin, netPerMin, runway, isBankrupt,
  } = finances;

  const runwayDays = Math.floor(runway / 1440);
  const runwayHours = Math.floor((runway % 1440) / 60);

  return (
    <div className="bg-black/80 border border-orange-700/30 clip-corners-small backdrop-blur-sm">
      <div className="p-3 border-b border-orange-900/30">
        <h3 className="text-[10px] font-mono text-orange-500 tracking-widest uppercase flex items-center gap-2">
          💰 FINANCIALS
        </h3>
      </div>

      <div className="p-3 space-y-2">
        {/* Cash */}
        <div className="flex justify-between text-[10px] font-mono font-bold">
          <span className="text-orange-500">CASH</span>
          <span className={isBankrupt ? 'text-red-400 animate-pulse' : cashRemaining < 50000 ? 'text-yellow-400' : 'text-green-400'}>
            ${cashRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {isBankrupt && (
          <div className="bg-red-950/50 border border-red-500/50 p-2 text-center clip-corners-small">
            <span className="text-red-400 text-[10px] font-mono font-bold animate-pulse">BANKRUPT</span>
          </div>
        )}

        {/* Burn rate breakdown */}
        <div className="pt-2 border-t border-orange-900/30 space-y-1">
          <div className="text-[8px] font-mono text-orange-600 tracking-wider uppercase mb-1">EXPENSES /MIN</div>
          <BurnRow label="Payroll" value={payrollPerMin} color="text-red-400" />
          <BurnRow label="Facilities" value={facilitiesPerMin} color="text-red-400" />
          <BurnRow label="Marketing" value={marketingPerMin} color="text-red-400" />
          <div className="flex justify-between text-[9px] font-mono font-bold pt-1 border-t border-orange-900/20">
            <span className="text-orange-500">BURN RATE</span>
            <span className="text-red-400">-${burnRatePerMin.toFixed(4)}/min</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="pt-2 border-t border-orange-900/30 space-y-1">
          <div className="flex justify-between text-[9px] font-mono">
            <span className="text-orange-600">Revenue/Min</span>
            <span className="text-green-400">+${revenuePerMin.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-orange-500">NET/MIN</span>
            <span className={netPerMin >= 0 ? 'text-green-400' : 'text-red-400'}>
              {netPerMin >= 0 ? '+' : ''}${netPerMin.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Runway */}
        <div className="pt-2 border-t border-orange-900/30">
          <div className="flex justify-between text-[9px] font-mono">
            <span className="text-orange-600">Runway</span>
            <span className={runway < 1440 ? 'text-red-400' : runway < 7200 ? 'text-yellow-400' : 'text-orange-400'}>
              {runwayDays > 0 ? `${runwayDays}d ` : ''}{runwayHours}h
            </span>
          </div>
          {/* Runway bar */}
          <div className="h-1.5 bg-orange-950/50 border border-orange-900/30 overflow-hidden mt-1">
            <div
              className={`h-full transition-all duration-500 ${
                runway < 1440 ? 'bg-red-500' : runway < 7200 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, (runway / 43200) * 100)}%` }}
            />
          </div>
        </div>

        {/* Sim time */}
        <div className="pt-2 border-t border-orange-900/30">
          <div className="flex justify-between text-[8px] font-mono text-orange-700">
            <span>Sim Tick</span>
            <span>{tick}</span>
          </div>
          <div className="flex justify-between text-[8px] font-mono text-orange-700">
            <span>Sim Day</span>
            <span>Day {Math.floor(tick / 1440) + 1}, {String(Math.floor((tick % 1440) / 60) + 9).padStart(2, '0')}:{String(tick % 60).padStart(2, '0')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BurnRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between text-[9px] font-mono">
      <span className="text-orange-700">{label}</span>
      <span className={color}>-${value.toFixed(4)}</span>
    </div>
  );
}

export default FinancialDashboard;
