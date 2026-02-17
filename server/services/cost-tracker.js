/**
 * Cost Tracker — Tracks real Claude API token usage and costs.
 * Per-agent breakdown, budget cap enforcement, projected spend.
 */

const log = require('../logger').child('COST');

class CostTracker {
  constructor(budgetCap = 1.00) {
    this.budgetCap = budgetCap;  // Hard cap in USD
    this.totalCost = 0;

    // Per-agent tracking
    this.agents = {};  // agentId → { calls, inputTokens, outputTokens, cost, history }

    // Global history
    this.callHistory = [];  // Every API call with full details

    // Pricing (per million tokens) — Anthropic Feb 2026
    this.pricing = {
      'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
      'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
      'claude-opus-4-6': { input: 15.00, output: 75.00 },
    };

    // Stats
    this.totalCalls = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.startTime = Date.now();
  }

  /**
   * Calculate cost for a number of tokens on a given model
   */
  calculateCost(model, inputTokens, outputTokens) {
    const rates = this.pricing[model] || this.pricing['claude-haiku-4-5-20251001'];
    const inputCost = (inputTokens / 1000000) * rates.input;
    const outputCost = (outputTokens / 1000000) * rates.output;
    return {
      inputCost: Math.round(inputCost * 1000000) / 1000000,
      outputCost: Math.round(outputCost * 1000000) / 1000000,
      totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
    };
  }

  /**
   * Record an API call
   */
  recordCall(agentId, agentName, model, inputTokens, outputTokens, details = {}) {
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    // Initialize agent tracking if new
    if (!this.agents[agentId]) {
      this.agents[agentId] = {
        name: agentName,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        businessCalls: 0,
        socialCalls: 0,
        history: [],
      };
    }

    const agent = this.agents[agentId];
    agent.calls++;
    agent.inputTokens += inputTokens;
    agent.outputTokens += outputTokens;
    agent.cost += cost.totalCost;

    if (details.type === 'social') {
      agent.socialCalls++;
    } else {
      agent.businessCalls++;
    }

    // Record in agent history
    agent.history.push({
      tick: details.tick,
      model,
      inputTokens,
      outputTokens,
      cost: cost.totalCost,
      type: details.type || 'business',
      task: details.task || '',
      timestamp: Date.now(),
    });

    // Keep last 500 per agent
    if (agent.history.length > 500) {
      agent.history = agent.history.slice(-500);
    }

    // Global tracking
    this.totalCalls++;
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalCost += cost.totalCost;

    // Full call log (for reports)
    const callRecord = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      agentName,
      model,
      inputTokens,
      outputTokens,
      cost: cost.totalCost,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      type: details.type || 'business',
      task: details.task || '',
      inputPrompt: details.inputPrompt || null,   // Full prompt (for report)
      outputResponse: details.outputResponse || null, // Full response (for report)
      tick: details.tick,
      timestamp: Date.now(),
    };

    this.callHistory.push(callRecord);
    log.debug('API call', { agentId, agentName, model, inputTokens, outputTokens, cost: cost.totalCost, totalSpent: Math.round(this.totalCost * 1000000) / 1000000 });

    // Budget threshold warnings
    const prevCost = this.totalCost - cost.totalCost;
    if (this.totalCost / this.budgetCap >= 0.75 && prevCost / this.budgetCap < 0.75) {
      log.warn('Budget 75% used', { spent: this.totalCost, cap: this.budgetCap });
    }
    if (this.totalCost / this.budgetCap >= 0.90 && prevCost / this.budgetCap < 0.90) {
      log.warn('Budget 90% used', { spent: this.totalCost, cap: this.budgetCap });
    }
    if (this.totalCost >= this.budgetCap && prevCost < this.budgetCap) {
      log.error('Budget exceeded!', { spent: this.totalCost, cap: this.budgetCap });
    }

    // Keep last 2000 calls
    if (this.callHistory.length > 2000) {
      this.callHistory = this.callHistory.slice(-2000);
    }

    return {
      ...cost,
      budgetRemaining: this.budgetCap - this.totalCost,
      budgetExceeded: this.totalCost >= this.budgetCap,
    };
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded() {
    return this.totalCost >= this.budgetCap;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget() {
    return Math.max(0, this.budgetCap - this.totalCost);
  }

  /**
   * Get cost per tick (rolling average)
   */
  getCostPerTick(windowSize = 50) {
    const recent = this.callHistory.slice(-windowSize);
    if (recent.length === 0) return 0;

    const ticks = new Set(recent.map(c => c.tick).filter(Boolean));
    const totalCost = recent.reduce((s, c) => s + c.cost, 0);

    return ticks.size > 0 ? totalCost / ticks.size : totalCost;
  }

  /**
   * Get projected hourly cost at current rate
   */
  getProjectedHourlyCost() {
    const elapsed = (Date.now() - this.startTime) / 1000 / 60;  // minutes
    if (elapsed < 1) return 0;
    const costPerMin = this.totalCost / elapsed;
    return Math.round(costPerMin * 60 * 1000) / 1000;  // $/hr
  }

  /**
   * Mark an agent as retired (keeps their data but flags them)
   */
  retireAgent(agentId) {
    if (this.agents[agentId]) {
      this.agents[agentId].retired = true;
      this.agents[agentId].retiredAt = Date.now();
    }
  }

  /**
   * Get full dashboard state
   */
  getState() {
    const elapsed = (Date.now() - this.startTime) / 1000 / 60;
    const costPerMin = elapsed > 0 ? this.totalCost / elapsed : 0;

    return {
      totals: {
        calls: this.totalCalls,
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        cost: Math.round(this.totalCost * 1000000) / 1000000,
        budgetCap: this.budgetCap,
        budgetRemaining: Math.round(this.getRemainingBudget() * 1000000) / 1000000,
        budgetUsedPercent: Math.round((this.totalCost / this.budgetCap) * 10000) / 100,
        budgetExceeded: this.isBudgetExceeded(),
      },
      rates: {
        costPerTick: Math.round(this.getCostPerTick() * 1000000) / 1000000,
        costPerMinute: Math.round(costPerMin * 1000000) / 1000000,
        projectedPerHour: this.getProjectedHourlyCost(),
      },
      agents: Object.entries(this.agents).map(([id, agent]) => ({
        id,
        name: agent.name,
        retired: agent.retired || false,
        calls: agent.calls,
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
        cost: Math.round(agent.cost * 1000000) / 1000000,
        costPerJob: agent.calls > 0
          ? Math.round((agent.cost / agent.calls) * 1000000) / 1000000
          : 0,
        businessCalls: agent.businessCalls,
        socialCalls: agent.socialCalls,
        avgResponseTokens: agent.calls > 0
          ? Math.round(agent.outputTokens / agent.calls)
          : 0,
      })),
      // Lead agent overhead
      leadOverhead: this.getLeadOverhead(),
    };
  }

  /**
   * Get lead agent's cost breakdown
   */
  getLeadOverhead() {
    const leadAgent = Object.entries(this.agents).find(([id]) => id === 'lead');
    if (!leadAgent) return { cost: 0, percentOfTotal: 0 };

    const [, agent] = leadAgent;
    return {
      cost: Math.round(agent.cost * 1000000) / 1000000,
      percentOfTotal: this.totalCost > 0
        ? Math.round((agent.cost / this.totalCost) * 10000) / 100
        : 0,
      strategyCalls: agent.businessCalls,
      socialCalls: agent.socialCalls,
    };
  }

  /**
   * Get full call history for reports (includes prompts + responses)
   */
  getFullCallHistory() {
    return this.callHistory;
  }

  /**
   * Update budget cap
   */
  setBudgetCap(newCap) {
    log.info('Budget cap updated', { oldCap: this.budgetCap, newCap });
    this.budgetCap = newCap;
  }
}

module.exports = CostTracker;
