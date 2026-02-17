/**
 * Message Bus — Inter-agent communication system.
 * Two layers: Business (structured data) and Social (natural chat).
 * Tracks relationships and evolves familiarity between agents.
 */

const log = require('../logger').child('MSG-BUS');

class MessageBus {
  constructor() {
    // All messages (business + social)
    this.messages = [];

    // Relationship state between agent pairs
    // Key: "agentId1:agentId2" (sorted alphabetically)
    this.relationships = {};

    // Familiarity thresholds for tone
    this.TONE_THRESHOLDS = {
      stranger: 0,       // 0-5 interactions
      colleague: 5,      // 5-15
      friendly: 15,      // 15-30
      close: 30,         // 30-50
      bestie: 50,        // 50+
    };
  }

  /**
   * Get relationship key for two agents (consistent ordering)
   */
  getRelationshipKey(agentId1, agentId2) {
    return [agentId1, agentId2].sort().join(':');
  }

  /**
   * Get or create relationship between two agents
   */
  getRelationship(agentId1, agentId2) {
    const key = this.getRelationshipKey(agentId1, agentId2);
    if (!this.relationships[key]) {
      this.relationships[key] = {
        agents: [agentId1, agentId2],
        interactions: 0,
        familiarity: 0,
        rapport: 'stranger',
        toneModifier: 'formal',
        memorableMoments: [],
        lastInteraction: null,
      };
    }
    return this.relationships[key];
  }

  /**
   * Get the rapport level label for a familiarity score
   */
  getRapport(familiarity) {
    if (familiarity >= 50) return 'bestie';
    if (familiarity >= 30) return 'close';
    if (familiarity >= 15) return 'friendly';
    if (familiarity >= 5) return 'colleague';
    return 'stranger';
  }

  /**
   * Get tone modifier for a rapport level
   */
  getToneModifier(rapport) {
    const tones = {
      stranger: 'formal',
      colleague: 'professional',
      friendly: 'casual',
      close: 'very casual',
      bestie: 'intimate',
    };
    return tones[rapport] || 'formal';
  }

  /**
   * Send a business message (structured, under the covers)
   */
  sendBusinessMessage(fromId, toId, content, tick) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'business',
      from: fromId,
      to: toId,
      content,   // structured object: { taskId, action, data }
      tick,
      timestamp: Date.now(),
    };

    this.messages.push(msg);
    this.recordInteraction(fromId, toId);

    // Keep message history bounded
    if (this.messages.length > 5000) {
      this.messages = this.messages.slice(-5000);
    }

    return msg;
  }

  /**
   * Send a social message (natural chat, visible in timeline)
   */
  sendSocialMessage(fromId, fromName, toId, toName, text, tick) {
    const msg = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'social',
      from: fromId,
      fromName,
      to: toId,
      toName,
      text,
      tick,
      timestamp: Date.now(),
    };

    this.messages.push(msg);
    this.recordInteraction(fromId, toId, true);
    log.info('Social message', { from: fromName, to: toName, tick, text: text.substring(0, 60) });

    if (this.messages.length > 5000) {
      this.messages = this.messages.slice(-5000);
    }

    return msg;
  }

  /**
   * Broadcast a message to all agents (e.g., CEO announcement)
   */
  broadcast(fromId, fromName, text, tick) {
    const msg = {
      id: `broadcast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'broadcast',
      from: fromId,
      fromName,
      to: 'all',
      text,
      tick,
      timestamp: Date.now(),
    };

    this.messages.push(msg);

    if (this.messages.length > 5000) {
      this.messages = this.messages.slice(-5000);
    }

    return msg;
  }

  /**
   * Record an interaction between two agents, evolving their relationship
   */
  recordInteraction(agentId1, agentId2, isSocial = false) {
    const rel = this.getRelationship(agentId1, agentId2);
    const oldRapport = rel.rapport;
    rel.interactions++;
    rel.familiarity = Math.min(100, rel.familiarity + (isSocial ? 1.5 : 0.5));
    rel.rapport = this.getRapport(rel.familiarity);
    rel.toneModifier = this.getToneModifier(rel.rapport);
    rel.lastInteraction = Date.now();
    if (rel.rapport !== oldRapport) {
      log.info('Rapport changed', { agents: [agentId1, agentId2], from: oldRapport, to: rel.rapport, familiarity: Math.round(rel.familiarity) });
    }
  }

  /**
   * Record a memorable moment between two agents
   */
  recordMemorableMoment(agentId1, agentId2, description) {
    const rel = this.getRelationship(agentId1, agentId2);
    rel.memorableMoments.push({
      description,
      timestamp: Date.now(),
    });
    log.info('Memorable moment', { agents: [agentId1, agentId2], description: description.substring(0, 80) });
    // Memorable moments boost familiarity extra
    rel.familiarity = Math.min(100, rel.familiarity + 3);
    rel.rapport = this.getRapport(rel.familiarity);
    rel.toneModifier = this.getToneModifier(rel.rapport);

    // Keep last 20 moments per relationship
    if (rel.memorableMoments.length > 20) {
      rel.memorableMoments = rel.memorableMoments.slice(-20);
    }
  }

  /**
   * Get messages for a specific agent (their inbox)
   */
  getMessagesFor(agentId, lastN = 20) {
    return this.messages
      .filter(m => m.to === agentId || m.to === 'all' || m.from === agentId)
      .slice(-lastN);
  }

  /**
   * Get social messages only (for timeline display)
   */
  getSocialMessages(lastN = 50) {
    return this.messages
      .filter(m => m.type === 'social' || m.type === 'broadcast')
      .slice(-lastN);
  }

  /**
   * Get relationship context for an agent (for their system prompt)
   */
  getRelationshipContext(agentId) {
    const context = {};
    for (const [key, rel] of Object.entries(this.relationships)) {
      if (rel.agents.includes(agentId)) {
        const otherId = rel.agents.find(id => id !== agentId);
        context[otherId] = {
          rapport: rel.rapport,
          tone: rel.toneModifier,
          interactions: rel.interactions,
          familiarity: Math.round(rel.familiarity),
          recentMoments: rel.memorableMoments.slice(-3).map(m => m.description),
        };
      }
    }
    return context;
  }

  /**
   * Get all relationships for display/report
   */
  getAllRelationships() {
    return Object.entries(this.relationships).map(([key, rel]) => ({
      key,
      agents: rel.agents,
      interactions: rel.interactions,
      familiarity: Math.round(rel.familiarity),
      rapport: rel.rapport,
      memorableMoments: rel.memorableMoments.length,
    }));
  }

  /**
   * Calculate social value of an agent (for retirement decisions)
   */
  getSocialValue(agentId) {
    let friendlyOrAbove = 0;
    let totalMoments = 0;
    let totalFamiliarity = 0;
    let connectionCount = 0;

    for (const rel of Object.values(this.relationships)) {
      if (rel.agents.includes(agentId)) {
        connectionCount++;
        totalFamiliarity += rel.familiarity;
        totalMoments += rel.memorableMoments.length;
        if (['friendly', 'close', 'bestie'].includes(rel.rapport)) {
          friendlyOrAbove++;
        }
      }
    }

    return {
      connections: connectionCount,
      friendlyOrAbove,
      memorableMoments: totalMoments,
      avgFamiliarity: connectionCount > 0 ? Math.round(totalFamiliarity / connectionCount) : 0,
      socialScore: friendlyOrAbove * 10 + totalMoments * 5 + (totalFamiliarity / Math.max(1, connectionCount)),
    };
  }

  /**
   * Estimate morale impact of removing an agent
   */
  estimateMoraleImpactOfRemoval(agentId) {
    let impactScore = 0;
    const affectedAgents = [];

    for (const rel of Object.values(this.relationships)) {
      if (rel.agents.includes(agentId)) {
        const otherId = rel.agents.find(id => id !== agentId);
        if (['friendly', 'close', 'bestie'].includes(rel.rapport)) {
          const hit = rel.rapport === 'bestie' ? 8 : rel.rapport === 'close' ? 5 : 3;
          impactScore += hit;
          affectedAgents.push({ agentId: otherId, moraleHit: hit, rapport: rel.rapport });
        }
      }
    }

    return {
      totalImpact: impactScore,
      affectedAgents,
      wouldTankMorale: impactScore > 15,
    };
  }
}

module.exports = MessageBus;
