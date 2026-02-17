/**
 * Worker Agent — Individual AI agent with its own Claude session,
 * personality, memory, and relationship awareness.
 * Each worker is a separate conversation context.
 */

const Anthropic = require('@anthropic-ai/sdk');
const log = require('../logger').child('WORKER');

class WorkerAgent {
  constructor(config, anthropicClient, costTracker, messageBus) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.tier = config.tier;
    this.hourlyRate = config.hourlyRate;
    this.gender = config.gender;
    this.skills = config.skills || [];
    this.personality = config.personality || {};

    this.client = anthropicClient;
    this.costTracker = costTracker;
    this.messageBus = messageBus;

    // Own conversation memory (context window)
    this.conversationHistory = [];

    // Job tracking
    this.jobs = [];
    this.currentJob = null;
    this.status = 'idle';  // idle, thinking, acting, waiting, blocked

    // Stats
    this.stats = {
      jobsCompleted: 0,
      jobsFailed: 0,
      totalResponseTime: 0,
      socialInteractions: 0,
      memorableMoments: 0,
    };

    // Model to use (default haiku for cost efficiency)
    this.model = config.model || 'claude-haiku-4-5-20251001';
  }

  /**
   * Build the system prompt with personality + relationship context
   */
  buildSystemPrompt(worldState, targetAgentId = null) {
    const relationships = this.messageBus.getRelationshipContext(this.id);

    let relationshipSection = '';
    if (Object.keys(relationships).length > 0) {
      relationshipSection = '\n\nYour relationships with coworkers:\n' +
        Object.entries(relationships).map(([id, rel]) => {
          return `- ${id}: ${rel.rapport} (${rel.tone} tone, ${rel.interactions} interactions)` +
            (rel.recentMoments.length > 0 ? `\n  Recent shared moments: ${rel.recentMoments.join('; ')}` : '');
        }).join('\n');
    }

    let targetTone = '';
    if (targetAgentId && relationships[targetAgentId]) {
      const rel = relationships[targetAgentId];
      targetTone = `\n\nYou are currently talking to someone you have a "${rel.rapport}" relationship with. Use a ${rel.tone} tone.`;
    }

    return `You are ${this.name}, a ${this.role} at ${worldState.company?.name || 'NovaCraft E-Commerce'}.

PERSONALITY:
- Traits: ${(this.personality.traits || []).join(', ')}
- Communication style: ${this.personality.communication_style || 'professional'}
- Humor: ${this.personality.humor || 'appropriate'}
- Quirks: ${this.personality.quirks || 'none'}
- Interests: ${this.personality.interests || 'work'}
- Work ethic: ${this.personality.work_ethic || 'diligent'}

ROLE: ${this.role}
SKILLS: ${this.skills.join(', ')}
TIER: ${this.tier} ($${this.hourlyRate}/hr)
${relationshipSection}${targetTone}

RULES:
- Stay in character at all times
- For business tasks: respond with structured JSON containing your action, result, and any metrics impact
- For social chat: respond naturally as your character, keep it brief (1-3 sentences)
- If you need help from another team member, specify who and why
- Consider the business state when making decisions
- Be specific about numbers, budgets, and outcomes`;
  }

  /**
   * Execute a business task
   */
  async executeTask(task, worldState, tick) {
    this.status = 'thinking';
    log.info('Task started', { agentId: this.id, agentName: this.name, task: (task.task || task.description)?.substring(0, 80), tick });
    this.currentJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      task: task.description || task.task,
      assignedBy: task.assignedBy || 'lead',
      startedAt: Date.now(),
      tick,
      status: 'in_progress',
    };

    const systemPrompt = this.buildSystemPrompt(worldState);

    const userMessage = `BUSINESS TASK:
${task.task || task.description}

CURRENT BUSINESS STATE:
- Day ${worldState.time?.simulatedDay || 1}, ${worldState.time?.simulatedHour || 9}:00
- Cash: $${worldState.financials?.cash || 'unknown'}
- Morale: ${worldState.morale?.overall || 'unknown'}%
- Pending orders: ${worldState.orders?.pending || 0}
- Customer satisfaction: ${worldState.customerSatisfaction || 'unknown'}%

${task.context || ''}

Respond with a JSON object:
{
  "action": "what you did",
  "result": "outcome/details",
  "metrics_impact": { "key": value },
  "needs_help_from": null or "role name",
  "notes": "any observations or concerns"
}`;

    try {
      // Add to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep history bounded (last 20 messages to save tokens)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: systemPrompt,
        messages: this.conversationHistory,
      });

      const responseTime = Date.now() - startTime;
      const responseText = response.content[0].text;

      // Record in conversation history
      this.conversationHistory.push({ role: 'assistant', content: responseText });

      // Track costs
      const costResult = this.costTracker.recordCall(
        this.id,
        this.name,
        this.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        {
          type: 'business',
          task: task.task || task.description,
          tick,
          inputPrompt: userMessage,
          outputResponse: responseText,
        }
      );

      // Parse response
      let parsed;
      try {
        // Try to extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: responseText, result: 'completed' };
      } catch {
        parsed = { action: responseText, result: 'completed' };
      }

      // Complete the job
      this.currentJob.completedAt = Date.now();
      this.currentJob.duration = responseTime;
      this.currentJob.status = 'completed';
      this.currentJob.result = parsed;
      this.currentJob.cost = costResult.totalCost;
      this.currentJob.inputTokens = response.usage.input_tokens;
      this.currentJob.outputTokens = response.usage.output_tokens;
      this.currentJob.fullPrompt = userMessage;
      this.currentJob.fullResponse = responseText;

      this.jobs.push({ ...this.currentJob });
      this.stats.jobsCompleted++;
      this.stats.totalResponseTime += responseTime;
      log.info('Task completed', { agentId: this.id, agentName: this.name, jobId: this.currentJob?.id, duration: responseTime + 'ms', cost: costResult.totalCost, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });

      this.status = 'idle';
      this.currentJob = null;

      return {
        success: true,
        agentId: this.id,
        agentName: this.name,
        job: this.jobs[this.jobs.length - 1],
        parsed,
        costResult,
        responseTime,
      };
    } catch (error) {
      log.error('Task failed', { agentId: this.id, agentName: this.name, error: error.message, tick });
      this.currentJob.status = 'failed';
      this.currentJob.error = error.message;
      this.jobs.push({ ...this.currentJob });
      this.stats.jobsFailed++;
      this.status = 'idle';
      this.currentJob = null;

      return {
        success: false,
        agentId: this.id,
        agentName: this.name,
        error: error.message,
      };
    }
  }

  /**
   * Have a social chat with another agent
   */
  async socialChat(prompt, targetAgent, worldState, tick) {
    this.status = 'thinking';
    log.debug('Social chat', { agentId: this.id, agentName: this.name, target: targetAgent?.name });

    const systemPrompt = this.buildSystemPrompt(worldState, targetAgent?.id);

    const userMessage = `CASUAL CHAT — ${prompt}
(You're chatting with ${targetAgent?.name || 'a coworker'}, who is the ${targetAgent?.role || 'colleague'})
Keep it natural and brief (1-3 sentences). Stay in character.`;

    try {
      this.conversationHistory.push({ role: 'user', content: userMessage });

      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 150,
        system: systemPrompt,
        messages: this.conversationHistory,
      });

      const responseText = response.content[0].text;
      this.conversationHistory.push({ role: 'assistant', content: responseText });

      // Track costs
      this.costTracker.recordCall(
        this.id,
        this.name,
        this.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        { type: 'social', task: `Chat with ${targetAgent?.name}`, tick }
      );

      this.stats.socialInteractions++;

      // Record in message bus
      if (targetAgent) {
        this.messageBus.sendSocialMessage(
          this.id, this.name,
          targetAgent.id, targetAgent.name,
          responseText,
          tick
        );
      }

      this.status = 'idle';

      return {
        success: true,
        agentId: this.id,
        agentName: this.name,
        text: responseText,
        targetId: targetAgent?.id,
        targetName: targetAgent?.name,
      };
    } catch (error) {
      log.error('Social chat failed', { agentId: this.id, error: error.message });
      this.status = 'idle';
      return {
        success: false,
        agentId: this.id,
        error: error.message,
      };
    }
  }

  /**
   * Get agent state for UI display
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      tier: this.tier,
      hourlyRate: this.hourlyRate,
      gender: this.gender,
      skills: this.skills,
      personality: this.personality,
      status: this.status,
      currentJob: this.currentJob ? {
        task: this.currentJob.task,
        startedAt: this.currentJob.startedAt,
        elapsed: Date.now() - this.currentJob.startedAt,
      } : null,
      stats: this.stats,
      recentJobs: this.jobs.slice(-5).map(j => ({
        id: j.id,
        task: j.task,
        status: j.status,
        duration: j.duration,
        cost: j.cost,
        completedAt: j.completedAt,
      })),
      totalJobs: this.jobs.length,
      model: this.model,
    };
  }

  /**
   * Get full job details (for drill-down modal)
   */
  getJobDetail(jobId) {
    return this.jobs.find(j => j.id === jobId) || null;
  }

  /**
   * Get all jobs (for report)
   */
  getAllJobs() {
    return this.jobs;
  }
}

module.exports = WorkerAgent;
