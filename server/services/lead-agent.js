/**
 * Lead Agent — The CEO. A persistent Claude session that:
 * - Evaluates the full business state each tick
 * - Makes strategic decisions (hire, fire, assign tasks, pivot strategy)
 * - Spawns worker agents (invents their name, personality, skills)
 * - Retires workers (weighing productivity + social value)
 * - Thinks in 2nd and 3rd order consequences
 */

const Anthropic = require('@anthropic-ai/sdk');
const WorkerAgent = require('./worker-agent');
const log = require('../logger').child('LEAD-AGENT');

class LeadAgent {
  constructor(config, anthropicClient, costTracker, messageBus, worldEngine) {
    this.client = anthropicClient;
    this.costTracker = costTracker;
    this.messageBus = messageBus;
    this.worldEngine = worldEngine;

    // Lead's own conversation history (persistent context)
    this.conversationHistory = [];

    // Model (sonnet for smarter strategic thinking, or haiku for cheaper)
    this.model = config.model || 'claude-haiku-4-5-20251001';

    // Active worker agents
    this.workers = new Map();  // id → WorkerAgent instance

    // Retired workers (for reports)
    this.retiredWorkers = [];

    // Agent ID counter
    this.nextAgentId = 1;

    // Decision history
    this.decisions = [];

    // Social interaction scheduler
    this.lastSocialTick = 0;
    this.socialInterval = 15;  // Every 15 ticks, prompt a social interaction
  }

  /**
   * Build the CEO system prompt
   */
  buildSystemPrompt() {
    return `You are the CEO of ${this.worldEngine.company.name}, an e-commerce company.

YOUR ROLE:
- Make strategic decisions for the business every cycle
- Hire/fire employees based on needs (you invent their name, personality, skills)
- Assign tasks to your team
- Think about 2nd and 3rd order consequences of every decision
- Manage the budget carefully — every employee burns cash per minute

THINKING PRINCIPLES:
- "If I cut the cleaner, what happens to office morale in 2 weeks?"
- "If I hire 3 salespeople, will the revenue offset their wages before runway runs out?"
- "This employee has great relationships — firing them might tank team morale"
- Everything is interconnected. Small decisions cascade.

RETIREMENT DECISIONS:
When considering who to let go, weigh BOTH:
1. Productivity — jobs completed, quality, speed
2. Social value — relationships with coworkers, memorable moments, team morale impact
A less productive employee who is the social glue of the team might be more valuable than a productive loner.

RESPONSE FORMAT — Always respond with valid JSON:
{
  "analysis": "1-2 sentence situation assessment",
  "decisions": [
    {
      "type": "hire|fire|assign_task|run_campaign|restock|social_prompt|adjust_strategy",
      ... (fields depend on type, see below)
    }
  ],
  "concerns": ["list of worries or risks"],
  "social_note": "optional observation about team dynamics"
}

DECISION TYPES:

hire:
{
  "type": "hire",
  "role": "specific role title",
  "tier": "executive|management|specialist|operations|support|facilities",
  "skills": ["skill1", "skill2"],
  "personality_seed": "brief personality description for the new hire",
  "gender": "M|F",
  "name": "Full Name (you invent this)",
  "hourlyRate": number,
  "justification": "why this hire"
}

fire:
{
  "type": "fire",
  "agent_id": "agent_X",
  "justification": "why firing",
  "social_consideration": "impact on team morale"
}

assign_task:
{
  "type": "assign_task",
  "agent_id": "agent_X",
  "task": "specific task description",
  "priority": "high|medium|low"
}

run_campaign:
{
  "type": "run_campaign",
  "agent_id": "agent_X (marketing person to run it)",
  "channel": "tiktok|instagram|google|email|marketplace|facebook",
  "budget": number,
  "product_id": "product ID",
  "target_segment": "gen-z|millennial|gen-x|boomer|bargain",
  "justification": "why this campaign"
}

restock:
{
  "type": "restock",
  "product_id": "product ID",
  "quantity": number,
  "justification": "why restocking"
}

social_prompt:
{
  "type": "social_prompt",
  "agent_ids": ["agent_X", "agent_Y"],
  "prompt": "team standup|coffee break|celebrating a win|etc"
}

adjust_strategy:
{
  "type": "adjust_strategy",
  "description": "what strategic shift you're making and why"
}`;
  }

  /**
   * Run a strategic evaluation cycle (called each tick or every N ticks)
   */
  async evaluate(tick) {
    const worldState = this.worldEngine.getState();
    const compactState = this.worldEngine.getCompactState();
    const tokenState = this.costTracker.getState();

    // Build context message
    const contextMessage = `TICK ${tick} — BUSINESS STATE UPDATE:

DAY ${compactState.day}, HOUR ${compactState.hour}:00
Cash: $${compactState.cash.toLocaleString()} | Burn: $${compactState.burnPerHour}/hr | Runway: ${compactState.runwayDays} days
Revenue today: $${compactState.revenueToday} | Morale: ${compactState.morale}% | Satisfaction: ${compactState.satisfaction}%
Pending orders: ${compactState.pendingOrders}
Products low/out: ${compactState.productsLow.length > 0 ? compactState.productsLow.join(', ') : 'none'} / ${compactState.productsOut.length > 0 ? compactState.productsOut.join(', ') : 'none'}

TEAM (${this.workers.size} active):
${Array.from(this.workers.values()).map(w => {
  const s = w.getState();
  return `- ${s.name} (${s.role}, $${s.hourlyRate}/hr) — ${s.status}, ${s.stats.jobsCompleted} jobs done`;
}).join('\n') || 'No employees yet!'}

AI BUDGET: $${tokenState.totals.cost.toFixed(4)} / $${tokenState.totals.budgetCap} (${tokenState.totals.budgetUsedPercent}% used)

RECENT EVENTS:
${worldState.recentEvents.slice(-5).map(e => `- ${e.description}`).join('\n') || 'None'}

RECENT EFFECTS:
${worldState.recentEffects.slice(-5).map(e => `- ${e.message}`).join('\n') || 'None'}

PRODUCTS:
${worldState.products.map(p => `- ${p.name}: $${p.sellPrice}, stock ${p.stock} (${p.stockStatus}), rating ${p.rating}`).join('\n')}

CHANNELS: ${worldState.channels.map(c => `${c.name}(${c.conversionRate}% conv, fatigue ${c.fatigue}%)`).join(', ')}

CAMPAIGN HISTORY: ${worldState.campaignSummary.campaigns} campaigns, avg ROI: ${worldState.campaignSummary.avgROI}

What are your decisions for this cycle? Remember: think about consequences.`;

    try {
      this.conversationHistory.push({ role: 'user', content: contextMessage });

      // Keep history bounded (last 30 for strategic context)
      if (this.conversationHistory.length > 30) {
        this.conversationHistory = this.conversationHistory.slice(-30);
      }

      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: this.buildSystemPrompt(),
        messages: this.conversationHistory,
      });

      const responseTime = Date.now() - startTime;
      const responseText = response.content[0].text;
      log.info('Evaluation complete', { tick, responseTime: responseTime + 'ms', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });

      this.conversationHistory.push({ role: 'assistant', content: responseText });

      // Track costs
      const costResult = this.costTracker.recordCall(
        'lead',
        'CEO (Lead Agent)',
        this.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        {
          type: 'business',
          task: `Strategic evaluation tick ${tick}`,
          tick,
          inputPrompt: contextMessage,
          outputResponse: responseText,
        }
      );

      // Parse decisions
      let parsed;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: responseText, decisions: [] };
      } catch {
        parsed = { analysis: responseText, decisions: [] };
      }

      // Store decision
      this.decisions.push({
        tick,
        analysis: parsed.analysis,
        decisions: parsed.decisions || [],
        concerns: parsed.concerns || [],
        socialNote: parsed.social_note,
        cost: costResult.totalCost,
        timestamp: Date.now(),
      });

      // Keep last 200 decisions
      if (this.decisions.length > 200) {
        this.decisions = this.decisions.slice(-200);
      }

      return {
        success: true,
        parsed,
        responseTime,
        costResult,
      };
    } catch (error) {
      log.error('Evaluation failed', { tick, error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process decisions returned by the lead agent
   */
  async processDecisions(decisions, tick) {
    const results = [];

    for (const decision of decisions) {
      try {
        switch (decision.type) {
          case 'hire':
            results.push(await this.processHire(decision, tick));
            break;
          case 'fire':
            results.push(this.processFire(decision, tick));
            break;
          case 'assign_task':
            results.push(await this.processAssignTask(decision, tick));
            break;
          case 'run_campaign':
            results.push(await this.processRunCampaign(decision, tick));
            break;
          case 'restock':
            results.push(this.processRestock(decision, tick));
            break;
          case 'social_prompt':
            results.push(await this.processSocialPrompt(decision, tick));
            break;
          case 'adjust_strategy':
            results.push({ type: 'strategy', description: decision.description });
            break;
          default:
            results.push({ type: 'unknown', decision });
        }
      } catch (error) {
        results.push({ type: decision.type, error: error.message });
      }
    }

    return results;
  }

  /**
   * Process a hire decision — spawn a new worker agent
   */
  async processHire(decision, tick) {
    const agentId = `agent_${this.nextAgentId++}`;

    const personality = {
      traits: (decision.personality_seed || '').split(',').map(t => t.trim()),
      communication_style: decision.personality_seed || 'professional',
      humor: 'appropriate',
      quirks: '',
      interests: '',
      work_ethic: 'diligent',
    };

    const worker = new WorkerAgent(
      {
        id: agentId,
        name: decision.name || `Agent ${agentId}`,
        role: decision.role,
        tier: decision.tier || 'specialist',
        hourlyRate: decision.hourlyRate || 40,
        gender: decision.gender || 'M',
        skills: decision.skills || [],
        personality,
        model: this.model,
      },
      this.client,
      this.costTracker,
      this.messageBus
    );

    this.workers.set(agentId, worker);
    log.info('Hired employee', { agentId, name: decision.name, role: decision.role, hourlyRate: decision.hourlyRate });

    // Add to world engine employees
    this.worldEngine.addEmployee({
      id: agentId,
      name: decision.name || `Agent ${agentId}`,
      role: decision.role,
      tier: decision.tier || 'specialist',
      hourlyRate: decision.hourlyRate || 40,
      skills: decision.skills || [],
    });

    // Broadcast the hire
    this.messageBus.broadcast(
      'lead', 'CEO',
      `Welcome ${decision.name} to the team as our new ${decision.role}!`,
      tick
    );

    return {
      type: 'hire',
      agentId,
      name: decision.name,
      role: decision.role,
      hourlyRate: decision.hourlyRate,
      justification: decision.justification,
    };
  }

  /**
   * Process a fire/retire decision
   */
  processFire(decision, tick) {
    const agentId = decision.agent_id;
    const worker = this.workers.get(agentId);

    if (!worker) {
      return { type: 'fire', error: `Agent ${agentId} not found` };
    }

    // Get social value before removing
    const socialValue = this.messageBus.getSocialValue(agentId);
    const moraleImpact = this.messageBus.estimateMoraleImpactOfRemoval(agentId);

    log.info('Fired employee', { agentId, name: worker.name, role: worker.role, socialScore: socialValue.socialScore, moraleImpact: moraleImpact.totalImpact });
    // Remove from world engine
    this.worldEngine.removeEmployee(agentId);

    // Archive and remove
    this.retiredWorkers.push({
      ...worker.getState(),
      retiredAt: tick,
      reason: decision.justification,
      socialValue,
      moraleImpact,
      allJobs: worker.getAllJobs(),
    });

    this.workers.delete(agentId);
    this.costTracker.retireAgent(agentId);

    // Broadcast
    this.messageBus.broadcast(
      'lead', 'CEO',
      `${worker.name} has left the company. We wish them well.`,
      tick
    );

    return {
      type: 'fire',
      agentId,
      name: worker.name,
      role: worker.role,
      justification: decision.justification,
      socialConsideration: decision.social_consideration,
      moraleImpact: moraleImpact.totalImpact,
    };
  }

  /**
   * Process a task assignment
   */
  async processAssignTask(decision, tick) {
    const worker = this.workers.get(decision.agent_id);
    if (!worker) {
      return { type: 'assign_task', error: `Agent ${decision.agent_id} not found` };
    }

    const worldState = this.worldEngine.getState();
    const result = await worker.executeTask(
      {
        task: decision.task,
        assignedBy: 'lead',
        priority: decision.priority || 'medium',
      },
      worldState,
      tick
    );

    return {
      type: 'assign_task',
      ...result,
    };
  }

  /**
   * Process a marketing campaign decision
   */
  async processRunCampaign(decision, tick) {
    // Record campaign expense
    this.worldEngine.ledger.recordExpense(tick, decision.budget, 'marketing', {
      channel: decision.channel,
      product: decision.product_id,
    });

    // Simulate campaign results
    const product = this.worldEngine.products.find(p => p.id === decision.product_id);
    if (!product) {
      return { type: 'run_campaign', error: `Product ${decision.product_id} not found` };
    }

    log.info('Campaign launched', { channel: decision.channel, budget: decision.budget, product: decision.product_id, segment: decision.target_segment });
    const result = this.worldEngine.market.simulateCampaign(
      decision.channel,
      decision.budget,
      product,
      decision.target_segment
    );

    // Record revenue from conversions
    if (result.success && result.grossRevenue > 0) {
      this.worldEngine.ledger.recordRevenue(tick, result.grossRevenue, 'campaign', {
        channel: decision.channel,
        product: product.name,
      });

      // Update product stock
      product.stock = Math.max(0, product.stock - result.conversions);

      // Add orders
      this.worldEngine.orders.pending += result.conversions;
    }

    // If a worker was assigned, have them report it
    const worker = this.workers.get(decision.agent_id);
    if (worker) {
      this.messageBus.sendBusinessMessage(
        decision.agent_id, 'lead',
        { type: 'campaign_result', ...result },
        tick
      );
    }

    return {
      type: 'run_campaign',
      campaign: result,
    };
  }

  /**
   * Process a restock decision
   */
  processRestock(decision, tick) {
    const product = this.worldEngine.products.find(p => p.id === decision.product_id);
    if (!product) {
      return { type: 'restock', error: `Product ${decision.product_id} not found` };
    }

    const result = this.worldEngine.restockProduct(
      decision.product_id,
      decision.quantity,
      product.costPrice
    );

    return {
      type: 'restock',
      ...result,
      justification: decision.justification,
    };
  }

  /**
   * Process a social interaction prompt
   */
  async processSocialPrompt(decision, tick) {
    const agentIds = decision.agent_ids || [];
    const prompt = decision.prompt || 'coffee break chat';
    const results = [];

    for (let i = 0; i < agentIds.length; i++) {
      const worker = this.workers.get(agentIds[i]);
      if (!worker) continue;

      // Pick a chat partner (next agent in the list, or random)
      const partnerId = agentIds[(i + 1) % agentIds.length];
      const partner = this.workers.get(partnerId);
      if (!partner || partnerId === agentIds[i]) continue;

      const result = await worker.socialChat(prompt, partner.getState(), this.worldEngine.getState(), tick);
      if (result.success) {
        results.push(result);
      }
    }

    return {
      type: 'social_prompt',
      prompt,
      results,
    };
  }

  /**
   * Check if it's time for a social interaction
   */
  shouldTriggerSocial(tick) {
    if (this.workers.size < 2) return false;
    if (tick - this.lastSocialTick < this.socialInterval) return false;
    return Math.random() < 0.3;  // 30% chance when eligible
  }

  /**
   * Trigger an organic social interaction
   */
  async triggerSocialInteraction(tick) {
    this.lastSocialTick = tick;

    const workerList = Array.from(this.workers.values());
    if (workerList.length < 2) return null;

    // Pick two random workers
    const idx1 = Math.floor(Math.random() * workerList.length);
    let idx2 = Math.floor(Math.random() * workerList.length);
    while (idx2 === idx1) idx2 = Math.floor(Math.random() * workerList.length);

    const prompts = [
      'coffee break — chat about your weekend plans',
      'passing in the hallway — quick greeting',
      'lunch break — talk about something non-work',
      'waiting for a meeting to start — small talk',
      'celebrating hitting a sales target',
      'commiserating about a tough day',
      'sharing a funny customer story',
    ];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    const worker1 = workerList[idx1];
    const worker2 = workerList[idx2];
    log.debug('Organic social interaction', { tick, agent1: worker1.name, agent2: worker2.name, prompt });

    const result1 = await worker1.socialChat(prompt, worker2.getState(), this.worldEngine.getState(), tick);

    // Worker 2 responds to worker 1
    let result2 = null;
    if (result1.success) {
      result2 = await worker2.socialChat(
        `${worker1.name} said: "${result1.text}" — respond naturally`,
        worker1.getState(),
        this.worldEngine.getState(),
        tick
      );
    }

    return {
      type: 'social_interaction',
      prompt,
      agent1: { id: worker1.id, name: worker1.name, text: result1?.text },
      agent2: { id: worker2.id, name: worker2.name, text: result2?.text },
    };
  }

  /**
   * Get all worker states for UI
   */
  getWorkersState() {
    return Array.from(this.workers.values()).map(w => w.getState());
  }

  /**
   * Get a specific worker's job detail
   */
  getWorkerJobDetail(agentId, jobId) {
    const worker = this.workers.get(agentId);
    if (!worker) return null;
    return worker.getJobDetail(jobId);
  }

  /**
   * Get lead agent state for UI
   */
  getState() {
    return {
      model: this.model,
      activeWorkers: this.workers.size,
      retiredWorkers: this.retiredWorkers.length,
      totalDecisions: this.decisions.length,
      recentDecisions: this.decisions.slice(-5),
      conversationLength: this.conversationHistory.length,
    };
  }

  /**
   * Get all data for report
   */
  getReportData() {
    return {
      decisions: this.decisions,
      retiredWorkers: this.retiredWorkers,
      activeWorkers: Array.from(this.workers.values()).map(w => ({
        ...w.getState(),
        allJobs: w.getAllJobs(),
      })),
    };
  }

  /**
   * Set the model (haiku vs sonnet)
   */
  setModel(model) {
    this.model = model;
    // Also update all workers
    for (const worker of this.workers.values()) {
      worker.model = model;
    }
  }
}

module.exports = LeadAgent;
