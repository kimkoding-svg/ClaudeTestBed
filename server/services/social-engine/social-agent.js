/**
 * Social Agent — each character's independent AI mind.
 *
 * Mirrors worker-agent.js pattern: own Claude conversation context,
 * own system prompt, own personality, own decisions.
 *
 * If an Anthropic client is provided, uses Claude API for real conversations.
 * Falls back to stub responses if no client (graceful degradation).
 */

const log = require('../../logger').child('SOCIAL-AGENT');

// Map shorthand model names to full model IDs
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
};

class SocialAgent {
  /**
   * @param {object} character - from CharacterRegistry
   * @param {object} config - { model, anthropicClient, costTracker, characterRegistry }
   */
  constructor(character, config = {}) {
    this.id = character.id;
    this.name = character.name;
    this.character = character;
    this.config = config;

    this.client = config.anthropicClient || null;
    this.costTracker = config.costTracker || null;
    this.characterRegistry = config.characterRegistry || null;
    this.modelId = MODEL_MAP[config.model] || config.model || MODEL_MAP.haiku;

    // Own conversation history (bounded)
    this.conversationHistory = [];
    this.maxHistory = 20;

    // Stats
    this.stats = {
      socialInteractions: 0,
      memorableMoments: 0,
      apiCalls: 0,
    };
  }

  /**
   * Build the system prompt for this agent's perspective.
   */
  buildSystemPrompt({ relationshipContext, activeEvents, themeContext }) {
    const ch = this.character;
    const traits = ch.traits;
    const dynamics = ch.dynamics || {};

    const lines = [
      `You are ${ch.name} in a stationery office. You sell pens, notebooks, paper, and office supplies.`,
      '',
      'YOUR PERSONALITY:',
      ch.personality || '',
      '',
      'YOUR TRAITS:',
      `- Friendliness: ${traits.friendliness}/100`,
      `- Humor: ${traits.humor}/100`,
      `- Seriousness: ${traits.seriousness}/100`,
      `- Empathy: ${traits.empathy}/100`,
      `- Assertiveness: ${traits.assertiveness}/100`,
      '',
      `YOUR CURRENT MOOD: ${ch.mood}/100 (${ch.mood > 70 ? 'good' : ch.mood > 40 ? 'okay' : 'low'})`,
    ];

    // Add dynamics if present
    if (dynamics.opposes && dynamics.opposes.length > 0) {
      const oppNames = dynamics.opposes.map(id => this._resolveName(id)).join(', ');
      lines.push('');
      lines.push(`PERSON YOU CLASH WITH: ${oppNames}`);
      if (dynamics.oppositionReason) {
        lines.push(`Why: ${dynamics.oppositionReason}`);
      }
    }

    if (dynamics.attractedTo && dynamics.attractedTo.length > 0) {
      lines.push('');
      lines.push('PEOPLE YOU LIKE / ARE DRAWN TO:');
      for (const id of dynamics.attractedTo) {
        const name = this._resolveName(id);
        const reason = dynamics.attractionReasons?.[id] || '';
        lines.push(`- ${name}${reason ? `: ${reason}` : ''}`);
      }
    }

    lines.push('');
    if (relationshipContext) lines.push(`YOUR RELATIONSHIPS:\n${relationshipContext}`);
    if (activeEvents) lines.push(`CURRENT EVENTS: ${activeEvents}`);
    if (themeContext) lines.push(`SITUATION: ${themeContext}`);

    lines.push('');
    lines.push('INSTRUCTIONS:');
    lines.push('- Stay in character. Your personality, dynamics, and mood shape EVERYTHING you say.');
    lines.push('- Keep responses to 1-2 short sentences. Be natural and conversational.');
    lines.push('- If talking to someone you clash with, show tension — sarcasm, dismissiveness, irritation.');
    lines.push('- If talking to someone you like, be warmer — more engaged, open, playful.');
    lines.push('- Your mood matters: low mood = more irritable or withdrawn.');
    lines.push('- Reference work topics (stationery orders, inventory, customers) naturally.');
    lines.push('');
    lines.push('RESPONSE FORMAT (JSON only, no markdown):');
    lines.push('{"text": "what you say out loud", "sentiment": 0.0}');
    lines.push('sentiment: -1.0 (very negative) to +1.0 (very positive)');

    return lines.filter(l => l !== undefined).join('\n');
  }

  /**
   * Generate this agent's response in an encounter.
   * Uses Claude API if available, falls back to stub.
   */
  async respond({ partnerName, partnerSummary, conversationSoFar, relationshipContext, activeEvents, themeContext }) {
    this.stats.socialInteractions++;

    if (this.client) {
      try {
        return await this._aiRespond({ partnerName, partnerSummary, conversationSoFar, relationshipContext, activeEvents, themeContext });
      } catch (err) {
        log.error('AI respond failed, falling back to stub', { agent: this.name, error: err.message });
        return this._stubRespond({ partnerName, conversationSoFar });
      }
    }

    return this._stubRespond({ partnerName, conversationSoFar });
  }

  /**
   * Generate a private memory note about an encounter.
   * Uses Claude API if available, falls back to stub.
   */
  async reflect({ partnerName, dialogue, mySentiment }) {
    if (this.client) {
      try {
        return await this._aiReflect({ partnerName, dialogue, mySentiment });
      } catch (err) {
        log.error('AI reflect failed, falling back to stub', { agent: this.name, error: err.message });
        return this._stubReflect({ partnerName, mySentiment });
      }
    }
    return this._stubReflect({ partnerName, mySentiment });
  }

  // ─── AI Implementation ──────────────────────────────────

  async _aiRespond({ partnerName, partnerSummary, conversationSoFar, relationshipContext, activeEvents, themeContext }) {
    const systemPrompt = this.buildSystemPrompt({ relationshipContext, activeEvents, themeContext });

    const userMessage = conversationSoFar
      ? `Continue this conversation with ${partnerName}:\n\n${conversationSoFar}\n\nNow respond as ${this.name}:`
      : `You just ran into ${partnerName} at the office. Say something to start a conversation.`;

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    this.stats.apiCalls++;

    // Track cost
    if (this.costTracker && response.usage) {
      this.costTracker.recordCall(
        this.id,
        this.name,
        this.modelId,
        response.usage.input_tokens,
        response.usage.output_tokens,
        { type: 'social_respond', partner: partnerName }
      );
    }

    // Parse response — strip markdown code blocks if present
    let rawText = response.content[0]?.text || '';
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(rawText);
      log.debug('AI respond', { agent: this.name, partner: partnerName, sentiment: parsed.sentiment });
      return {
        text: parsed.text || rawText,
        sentiment: typeof parsed.sentiment === 'number' ? Math.max(-1, Math.min(1, parsed.sentiment)) : 0,
      };
    } catch {
      // If not valid JSON, use the raw text
      log.warn('AI response not valid JSON, using raw text', { agent: this.name, raw: rawText.slice(0, 100) });
      return { text: rawText.slice(0, 200), sentiment: 0 };
    }
  }

  async _aiReflect({ partnerName, dialogue, mySentiment }) {
    const systemPrompt = `You are ${this.name}. Write a brief 1-sentence private thought/memory about a conversation you just had. Be specific about what was said or how it made you feel. Just output the sentence, no JSON.`;

    const userMessage = `You just talked to ${partnerName}. Your overall feeling: ${mySentiment > 0.3 ? 'positive' : mySentiment < -0.3 ? 'negative' : 'neutral'}.\n\nConversation:\n${dialogue.join('\n')}\n\nYour private thought:`;

    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    this.stats.apiCalls++;

    if (this.costTracker && response.usage) {
      this.costTracker.recordCall(
        this.id,
        this.name,
        this.modelId,
        response.usage.input_tokens,
        response.usage.output_tokens,
        { type: 'social_reflect', partner: partnerName }
      );
    }

    return response.content[0]?.text || `Brief chat with ${partnerName}.`;
  }

  // ─── Stub Implementation (fallback) ─────────────────────

  _stubRespond({ partnerName, conversationSoFar }) {
    const ch = this.character;
    const mood = ch.mood;
    const friendliness = ch.traits.friendliness;
    const humor = ch.traits.humor;
    const dynamics = ch.dynamics || {};

    // Check if partner is someone we oppose or like
    const partnerId = this._resolveId(partnerName);
    const isOpposed = dynamics.opposes?.includes(partnerId);
    const isAttracted = dynamics.attractedTo?.includes(partnerId);

    let text;
    let sentiment;

    if (!conversationSoFar) {
      // Opening line
      if (isOpposed) {
        text = humor > 60
          ? `Oh, ${partnerName}. What a surprise.`
          : `${partnerName}. Need something?`;
        sentiment = -0.2;
      } else if (isAttracted && mood > 40) {
        text = humor > 60
          ? `Hey ${partnerName}! Just the person I wanted to see.`
          : `Hi ${partnerName}, how's your morning going?`;
        sentiment = 0.3;
      } else if (friendliness > 60 && mood > 50) {
        text = `Hey ${partnerName}, how's it going?`;
        sentiment = 0.2;
      } else if (mood < 40) {
        text = `Oh, hey ${partnerName}.`;
        sentiment = -0.1;
      } else {
        text = `Hi ${partnerName}.`;
        sentiment = 0.0;
      }
    } else {
      // Reply
      if (isOpposed) {
        text = humor > 60
          ? "Right. Well, this has been... something."
          : "If you say so.";
        sentiment = -0.3;
      } else if (isAttracted && mood > 40) {
        text = humor > 60
          ? "Ha, yeah exactly! You always get it."
          : "Yeah, I was thinking the same thing actually.";
        sentiment = 0.3;
      } else if (friendliness > 60 && mood > 50) {
        text = "Yeah, you know how it is around here.";
        sentiment = 0.2;
      } else if (mood < 40) {
        text = "Mm, not great to be honest.";
        sentiment = -0.2;
      } else {
        text = "Yeah, pretty standard day so far.";
        sentiment = 0.0;
      }
    }

    log.debug('Stub respond', { agent: this.name, partner: partnerName, sentiment });
    return { text, sentiment };
  }

  _stubReflect({ partnerName, mySentiment }) {
    if (mySentiment > 0.3) {
      return `Had a nice chat with ${partnerName}. Good vibes.`;
    } else if (mySentiment < -0.3) {
      return `Talked to ${partnerName}, wasn't great. Felt a bit off.`;
    } else {
      return `Brief chat with ${partnerName}. Nothing special.`;
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  _resolveName(id) {
    if (this.characterRegistry) {
      const ch = this.characterRegistry.getCharacter(id);
      if (ch) return ch.name;
    }
    // Fallback: derive from ID
    return id.replace('char_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  _resolveId(name) {
    if (this.characterRegistry) {
      const all = this.characterRegistry.getAllCharacters();
      const match = all.find(ch => ch.name === name);
      if (match) return match.id;
    }
    return '';
  }

  /**
   * Return serialisable state.
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      stats: { ...this.stats },
      historyLength: this.conversationHistory.length,
      hasAI: !!this.client,
    };
  }
}

module.exports = { SocialAgent };
