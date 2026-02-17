/**
 * Market Simulator — Processes agent marketing/sales actions into realistic outcomes.
 * Channels, customer segments, campaign results, product demand curves.
 */

const log = require('../logger').child('MARKET');

class MarketSimulator {
  constructor() {
    // Marketing channels with baseline stats
    this.channels = {
      tiktok: {
        name: 'TikTok',
        reach: 500000,
        cpc: 0.02,                // Cost per click
        baseConversionRate: 0.031, // 3.1% baseline
        demographic: '18-25',
        bestFor: ['trendy', 'visual', 'impulse'],
        fatigueFactor: 0,         // Increases with repeated campaigns, reduces effectiveness
      },
      instagram: {
        name: 'Instagram',
        reach: 300000,
        cpc: 0.05,
        baseConversionRate: 0.022,
        demographic: '22-35',
        bestFor: ['lifestyle', 'fashion', 'visual'],
        fatigueFactor: 0,
      },
      google: {
        name: 'Google Ads',
        reach: 1000000,
        cpc: 0.15,
        baseConversionRate: 0.018,
        demographic: '25-55',
        bestFor: ['search-intent', 'practical', 'comparison'],
        fatigueFactor: 0,
      },
      email: {
        name: 'Email Marketing',
        reach: 50000,
        cpc: 0.001,
        baseConversionRate: 0.045,
        demographic: 'existing',
        bestFor: ['repeat', 'deals', 'loyalty'],
        fatigueFactor: 0,
      },
      marketplace: {
        name: 'Online Marketplace',
        reach: 200000,
        cpc: 0,                    // No CPC, but commission
        commission: 0.15,          // 15% of sale price
        baseConversionRate: 0.025,
        demographic: 'all',
        bestFor: ['commodity', 'price-sensitive', 'discovery'],
        fatigueFactor: 0,
      },
      facebook: {
        name: 'Facebook Ads',
        reach: 400000,
        cpc: 0.08,
        baseConversionRate: 0.015,
        demographic: '30-55',
        bestFor: ['community', 'local', 'events'],
        fatigueFactor: 0,
      },
    };

    // Customer segments
    this.customerSegments = [
      {
        id: 'gen-z',
        label: 'Gen Z',
        age: '18-25',
        size: 100000,
        interests: ['trendy', 'visual', 'impulse', 'social'],
        channelPreference: 'tiktok',
        pricesSensitivity: 0.8,   // Higher = more price sensitive
        brandLoyalty: 0.2,
      },
      {
        id: 'millennial',
        label: 'Millennials',
        age: '26-40',
        size: 80000,
        interests: ['lifestyle', 'quality', 'reviews', 'comparison'],
        channelPreference: 'instagram',
        pricesSensitivity: 0.5,
        brandLoyalty: 0.5,
      },
      {
        id: 'gen-x',
        label: 'Gen X',
        age: '41-55',
        size: 60000,
        interests: ['practical', 'value', 'reliability', 'search-intent'],
        channelPreference: 'google',
        pricesSensitivity: 0.4,
        brandLoyalty: 0.7,
      },
      {
        id: 'boomer',
        label: 'Boomers',
        age: '56-70',
        size: 40000,
        interests: ['quality', 'trust', 'deals', 'loyalty'],
        channelPreference: 'email',
        pricesSensitivity: 0.3,
        brandLoyalty: 0.8,
      },
      {
        id: 'bargain',
        label: 'Bargain Hunters',
        age: 'all',
        size: 120000,
        interests: ['price-sensitive', 'deals', 'commodity', 'comparison'],
        channelPreference: 'marketplace',
        pricesSensitivity: 0.95,
        brandLoyalty: 0.1,
      },
    ];

    // Campaign history
    this.campaignHistory = [];

    // Active campaigns (running over time)
    this.activeCampaigns = [];
  }

  /**
   * Calculate how well a product matches a customer segment (0-1)
   */
  matchScore(product, segment) {
    if (!product.tags || !segment.interests) return 0.5;

    const overlap = product.tags.filter(t => segment.interests.includes(t)).length;
    const maxPossible = Math.max(product.tags.length, segment.interests.length, 1);
    const baseMatch = overlap / maxPossible;

    // Price sensitivity affects match — expensive products match poorly with price-sensitive segments
    const priceRatio = product.sellPrice / (product.category === 'premium' ? 200 : 50);
    const pricePenalty = segment.pricesSensitivity * Math.max(0, priceRatio - 0.5) * 0.3;

    return Math.max(0.1, Math.min(1, baseMatch + 0.3 - pricePenalty));
  }

  /**
   * Simulate a marketing campaign — returns realistic outcomes
   */
  simulateCampaign(channelId, budget, product, targetSegmentId = null) {
    const channel = this.channels[channelId];
    if (!channel) {
      log.warn('Unknown marketing channel', { channelId });
      return { success: false, error: `Unknown channel: ${channelId}` };
    }

    // Find best-matching segment if not specified
    const segment = targetSegmentId
      ? this.customerSegments.find(s => s.id === targetSegmentId)
      : this.customerSegments.find(s => s.channelPreference === channelId)
        || this.customerSegments[0];

    // Calculate impressions
    let impressions;
    if (channel.cpc > 0) {
      impressions = Math.floor(budget / channel.cpc);
    } else {
      // Marketplace: impressions based on budget as listing fee
      impressions = Math.floor(budget * 1000);
    }

    // Cap at channel reach
    impressions = Math.min(impressions, channel.reach);

    // Calculate clicks (CTR varies by channel relevance)
    const relevance = this.matchScore(product, segment);
    const baseCTR = 0.02 + (relevance * 0.05);  // 2-7% CTR
    const fatiguePenalty = channel.fatigueFactor * 0.1;
    const effectiveCTR = Math.max(0.005, baseCTR - fatiguePenalty);
    const clicks = Math.floor(impressions * effectiveCTR);

    // Calculate conversions
    const effectiveConvRate = channel.baseConversionRate * relevance * this.randomVariance(0.6, 1.4);
    const conversions = Math.floor(clicks * effectiveConvRate);

    // Revenue calculation
    const grossRevenue = conversions * product.sellPrice;
    const cogs = conversions * product.costPrice;
    const commission = channel.commission ? grossRevenue * channel.commission : 0;
    const netRevenue = grossRevenue - cogs - commission;
    const profit = netRevenue - budget;
    const roi = budget > 0 ? profit / budget : 0;

    // Increase channel fatigue (diminishing returns)
    channel.fatigueFactor = Math.min(1, channel.fatigueFactor + 0.05);

    const result = {
      success: true,
      channelId,
      channelName: channel.name,
      targetSegment: segment.id,
      budget,
      impressions,
      clicks,
      ctr: Math.round(effectiveCTR * 10000) / 100,  // percentage
      conversions,
      conversionRate: Math.round(effectiveConvRate * 10000) / 100,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      productId: product.id,
      relevanceScore: Math.round(relevance * 100) / 100,
    };

    this.campaignHistory.push({ ...result, tick: null, timestamp: Date.now() });
    log.info('Campaign simulated', { channel: channelId, budget, product: product.id, impressions, conversions, roi: result.roi, profit: result.profit });

    return result;
  }

  /**
   * Simulate organic/passive sales (happens every tick without campaigns)
   */
  simulateOrganicSales(products, customerSatisfaction) {
    const sales = [];

    for (const product of products) {
      if (product.stock <= 0) continue;

      // Base organic rate depends on product rating and satisfaction
      const ratingFactor = (product.rating || 3) / 5;
      const satisfactionFactor = customerSatisfaction / 100;
      const velocityFactor = Math.max(0.1, product.salesVelocity || 0.5);

      // Chance of a sale this minute
      const saleProbability = 0.01 * ratingFactor * satisfactionFactor * velocityFactor;

      if (Math.random() < saleProbability) {
        const quantity = 1;
        const revenue = product.sellPrice * quantity;
        const cost = product.costPrice * quantity;

        sales.push({
          productId: product.id,
          productName: product.name,
          quantity,
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          profit: Math.round((revenue - cost) * 100) / 100,
          source: 'organic',
        });
      }
    }

    return sales;
  }

  /**
   * Simulate a sales contact attempt (when a sales agent contacts leads)
   */
  simulateSalesContact(leadQuality, agentSkill, product) {
    // Lead quality: 0-1 (how warm the lead is)
    // Agent skill: 0-1 (modified by experience + personality)
    const baseCloseRate = 0.05;  // 5% base
    const closeRate = baseCloseRate * (1 + leadQuality) * (1 + agentSkill * 0.5);
    const closed = Math.random() < closeRate;

    if (closed) {
      return {
        success: true,
        closed: true,
        revenue: product.sellPrice,
        profit: product.sellPrice - product.costPrice,
      };
    }

    return {
      success: true,
      closed: false,
      followUpNeeded: Math.random() < 0.3,  // 30% want follow-up
    };
  }

  /**
   * Decay channel fatigue over time (channels recover effectiveness)
   */
  decayFatigue() {
    for (const channel of Object.values(this.channels)) {
      channel.fatigueFactor = Math.max(0, channel.fatigueFactor - 0.01);
    }
  }

  /**
   * Get channel stats for agent/lead context
   */
  getChannelStats() {
    return Object.entries(this.channels).map(([id, ch]) => ({
      id,
      name: ch.name,
      reach: ch.reach,
      cpc: ch.cpc,
      conversionRate: Math.round(ch.baseConversionRate * 1000) / 10,
      demographic: ch.demographic,
      fatigue: Math.round(ch.fatigueFactor * 100),
      bestFor: ch.bestFor,
    }));
  }

  /**
   * Get segment info for agent context
   */
  getSegmentStats() {
    return this.customerSegments.map(s => ({
      id: s.id,
      label: s.label,
      age: s.age,
      size: s.size,
      channelPreference: s.channelPreference,
      priceSensitivity: s.pricesSensitivity,
    }));
  }

  /**
   * Get recent campaign performance summary
   */
  getCampaignSummary(lastN = 10) {
    const recent = this.campaignHistory.slice(-lastN);
    if (recent.length === 0) return { campaigns: 0, totalSpend: 0, totalRevenue: 0, avgROI: 0 };

    const totalSpend = recent.reduce((s, c) => s + c.budget, 0);
    const totalRevenue = recent.reduce((s, c) => s + c.grossRevenue, 0);
    const avgROI = recent.reduce((s, c) => s + c.roi, 0) / recent.length;

    return {
      campaigns: recent.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgROI: Math.round(avgROI * 100) / 100,
      byChannel: this.groupBy(recent, 'channelId'),
      recent,
    };
  }

  /**
   * Helper: random variance factor
   */
  randomVariance(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Helper: group array by key
   */
  groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key];
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }
}

module.exports = MarketSimulator;
