/**
 * Report Generator — Compiles a full simulation report when paused.
 * Includes all API call logs, metrics, timeline, relationships, financials.
 */

class ReportGenerator {
  /**
   * Generate a comprehensive report from all simulation data
   */
  static generate(leadAgent, worldEngine, costTracker, messageBus) {
    const worldState = worldEngine.getState();
    const costState = costTracker.getState();
    const leadData = leadAgent.getReportData();
    const relationships = messageBus.getAllRelationships();
    const socialMessages = messageBus.getSocialMessages(200);

    return {
      generatedAt: new Date().toISOString(),

      // Summary
      summary: {
        totalTicks: worldEngine.time.tick,
        simulatedDays: worldEngine.time.simulatedDay,
        simulatedHours: worldEngine.time.simulatedHour - 9 + (worldEngine.time.simulatedDay - 1) * 8,
        totalApiCost: costState.totals.cost,
        totalApiCalls: costState.totals.calls,
        totalInputTokens: costState.totals.inputTokens,
        totalOutputTokens: costState.totals.outputTokens,
        budgetUsed: costState.totals.budgetUsedPercent,
        eventsProcessed: worldEngine.eventHistory.length,
        activeWorkers: leadAgent.workers.size,
        retiredWorkers: leadAgent.retiredWorkers.length,
        totalHires: leadAgent.workers.size + leadAgent.retiredWorkers.length,
      },

      // Financial summary
      financials: {
        startingCash: worldEngine.ledger.startingCash,
        currentCash: worldState.financials.cash,
        cashChange: worldState.financials.cash - worldEngine.ledger.startingCash,
        totalRevenue: worldState.financials.revenue.total,
        totalExpenses: worldState.financials.expenses.total,
        burnRate: worldState.financials.burnRate,
        runway: worldState.financials.runway,
        snapshots: worldEngine.ledger.snapshots,
      },

      // Per-agent breakdown
      agents: {
        active: leadData.activeWorkers.map(w => ({
          id: w.id,
          name: w.name,
          role: w.role,
          tier: w.tier,
          hourlyRate: w.hourlyRate,
          status: w.status,
          jobsCompleted: w.stats.jobsCompleted,
          jobsFailed: w.stats.jobsFailed,
          socialInteractions: w.stats.socialInteractions,
          totalJobs: w.allJobs.length,
          avgResponseTime: w.stats.jobsCompleted > 0
            ? Math.round(w.stats.totalResponseTime / w.stats.jobsCompleted)
            : 0,
          apiCost: costTracker.agents[w.id]
            ? Math.round(costTracker.agents[w.id].cost * 1000000) / 1000000
            : 0,
          tokensUsed: costTracker.agents[w.id]
            ? costTracker.agents[w.id].inputTokens + costTracker.agents[w.id].outputTokens
            : 0,
        })),
        retired: leadData.retiredWorkers.map(w => ({
          id: w.id,
          name: w.name,
          role: w.role,
          retiredAt: w.retiredAt,
          reason: w.reason,
          jobsCompleted: w.stats.jobsCompleted,
          socialValue: w.socialValue,
          moraleImpact: w.moraleImpact,
        })),
        lead: {
          model: leadAgent.model,
          totalDecisions: leadData.decisions.length,
          apiCost: costState.leadOverhead.cost,
          percentOfBudget: costState.leadOverhead.percentOfTotal,
        },
      },

      // Token usage breakdown
      tokenUsage: costState,

      // Business metrics
      businessMetrics: {
        products: worldState.products,
        orders: worldState.orders,
        morale: worldState.morale,
        customerSatisfaction: worldState.customerSatisfaction,
        productivityModifier: worldState.productivityModifier,
        facilities: worldState.facilities,
        campaignSummary: worldState.campaignSummary,
      },

      // Relationships
      relationships: relationships.map(r => ({
        ...r,
        agent1Name: getAgentName(r.agents[0], leadData),
        agent2Name: getAgentName(r.agents[1], leadData),
      })),

      // Timeline (events + social messages, merged and sorted)
      timeline: buildTimeline(worldEngine, socialMessages, leadData.decisions),

      // Full API call log (expandable in UI)
      apiCallLog: costTracker.getFullCallHistory().map(call => ({
        id: call.id,
        agentId: call.agentId,
        agentName: call.agentName,
        model: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        cost: call.cost,
        type: call.type,
        task: call.task,
        tick: call.tick,
        timestamp: call.timestamp,
        // Full prompt/response available on drill-down
        hasFullData: !!(call.inputPrompt && call.outputResponse),
      })),

      // CEO decisions log
      decisions: leadData.decisions,
    };
  }
}

/**
 * Helper: Get agent name by ID from lead data
 */
function getAgentName(agentId, leadData) {
  if (agentId === 'lead') return 'CEO (Lead)';
  const active = leadData.activeWorkers.find(w => w.id === agentId);
  if (active) return active.name;
  const retired = leadData.retiredWorkers.find(w => w.id === agentId);
  if (retired) return `${retired.name} (retired)`;
  return agentId;
}

/**
 * Helper: Build merged timeline from events, messages, and decisions
 */
function buildTimeline(worldEngine, socialMessages, decisions) {
  const items = [];

  // Events
  for (const event of worldEngine.eventHistory) {
    items.push({
      type: 'event',
      tick: event.tick,
      timestamp: event.timestamp,
      content: event.description,
      severity: event.severity,
    });
  }

  // Social messages
  for (const msg of socialMessages) {
    items.push({
      type: msg.type === 'broadcast' ? 'broadcast' : 'chat',
      tick: msg.tick,
      timestamp: msg.timestamp,
      from: msg.fromName,
      to: msg.toName || 'all',
      content: msg.text,
    });
  }

  // CEO decisions
  for (const dec of decisions) {
    items.push({
      type: 'decision',
      tick: dec.tick,
      timestamp: dec.timestamp,
      content: dec.analysis,
      decisions: dec.decisions.map(d => `${d.type}: ${d.justification || d.task || d.description || ''}`),
    });
  }

  // Effect chain events
  for (const effect of worldEngine.effectLog) {
    if (effect.type === 'chain_effect' || effect.type === 'random_event') {
      items.push({
        type: 'effect',
        tick: effect.tick,
        content: effect.message,
        severity: effect.severity,
        chain: effect.chain,
      });
    }
  }

  // Sort by tick then timestamp
  items.sort((a, b) => (a.tick || 0) - (b.tick || 0) || (a.timestamp || 0) - (b.timestamp || 0));

  return items;
}

module.exports = ReportGenerator;
