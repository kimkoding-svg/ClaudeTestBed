/**
 * World Engine — The business reality simulator.
 * Manages the full business state, processes cause-and-effect chains,
 * handles morale, facilities, products, and time progression.
 * Every action has consequences. Everything is interconnected.
 */

const FinancialLedger = require('./financial-ledger');
const MarketSimulator = require('./market-simulator');
const log = require('../logger').child('WORLD');

class WorldEngine {
  constructor(config = {}) {
    this.ledger = new FinancialLedger(config.startingCash || 500000);
    this.market = new MarketSimulator();

    // Company info
    this.company = {
      name: config.companyName || 'NovaCraft E-Commerce',
    };

    // Products catalog
    this.products = config.products || [
      { id: 'widget-a', name: 'Smart Widget Pro', category: 'electronics', costPrice: 12, sellPrice: 39.99, stock: 500, salesVelocity: 1.0, rating: 4.2, reviews: 45, tags: ['trendy', 'visual', 'practical'] },
      { id: 'widget-b', name: 'Eco Bottle', category: 'lifestyle', costPrice: 5, sellPrice: 24.99, stock: 800, salesVelocity: 0.8, rating: 4.5, reviews: 120, tags: ['lifestyle', 'quality', 'visual'] },
      { id: 'widget-c', name: 'Desk Organizer Deluxe', category: 'office', costPrice: 8, sellPrice: 34.99, stock: 300, salesVelocity: 0.5, rating: 3.8, reviews: 22, tags: ['practical', 'value', 'comparison'] },
      { id: 'widget-d', name: 'Fitness Band Ultra', category: 'fitness', costPrice: 18, sellPrice: 59.99, stock: 200, salesVelocity: 0.6, rating: 4.0, reviews: 67, tags: ['trendy', 'impulse', 'social'] },
      { id: 'widget-e', name: 'Aroma Diffuser Zen', category: 'home', costPrice: 10, sellPrice: 44.99, stock: 400, salesVelocity: 0.4, rating: 4.6, reviews: 89, tags: ['lifestyle', 'quality', 'deals'] },
    ];

    // Employees (dynamic — managed by lead agent)
    this.employees = [];

    // Facilities
    this.facilities = {
      office: { rent: 3000, condition: 90, cleanlinessScore: 85, lastCleaned: 0 },
      warehouse: { rent: 2000, capacity: 1000, utilized: 0, condition: 85 },
    };

    // Morale system — everything feeds into this
    this.morale = {
      overall: 75,
      factors: {
        cleanliness: 85,
        management: 70,
        workload: 70,
        social: 75,
        pay: 70,
        environment: 80,
      },
    };

    // Customer satisfaction
    this.customerSatisfaction = 75;

    // Order tracking
    this.orders = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      totalProcessed: 0,
    };

    // Event queue (auto + manual)
    this.eventQueue = [];
    this.eventHistory = [];

    // Time tracking
    this.time = {
      tick: 0,
      simulatedMinute: 0,
      simulatedHour: 9,     // Start at 9am
      simulatedDay: 1,
      isBusinessHours: true,
    };

    // Cause-effect chain log (for UI timeline)
    this.effectLog = [];
  }

  /**
   * Process a single tick (1 simulated minute)
   */
  processTick() {
    this.time.tick++;
    this.time.simulatedMinute++;

    // Update time of day
    this.time.simulatedHour = 9 + Math.floor(this.time.simulatedMinute / 60);
    if (this.time.simulatedHour >= 17) {
      // End of business day
      this.time.simulatedDay++;
      this.time.simulatedMinute = 0;
      this.time.simulatedHour = 9;
      this.ledger.resetDaily();
    }
    this.time.isBusinessHours = this.time.simulatedHour >= 9 && this.time.simulatedHour < 17;

    // Weekly reset (every 5 business days)
    if (this.time.simulatedDay % 5 === 0 && this.time.simulatedMinute === 0) {
      this.ledger.resetWeekly();
    }

    // Monthly reset (every 20 business days)
    if (this.time.simulatedDay % 20 === 0 && this.time.simulatedMinute === 0) {
      this.ledger.resetMonthly();
    }

    const effects = [];

    // 1. Process financial tick (payroll, facilities burn)
    const financials = this.ledger.processTick(
      this.time.tick,
      this.employees,
      this.getActiveCampaignSpendPerMin()
    );

    // 2. Process cause-effect chains
    effects.push(...this.processCleanliness());
    effects.push(...this.processMorale());
    effects.push(...this.processWorkload());
    effects.push(...this.processOrders());
    effects.push(...this.processProductDecay());

    // 3. Organic sales
    const organicSales = this.market.simulateOrganicSales(
      this.products,
      this.customerSatisfaction
    );
    for (const sale of organicSales) {
      this.ledger.recordRevenue(this.time.tick, sale.revenue, 'organic', sale);
      const product = this.products.find(p => p.id === sale.productId);
      if (product) {
        product.stock -= sale.quantity;
        this.orders.totalProcessed++;
      }
      effects.push({
        type: 'sale',
        message: `Organic sale: ${sale.productName} — $${sale.revenue}`,
        impact: { revenue: sale.revenue },
      });
    }

    // 4. Decay channel fatigue
    if (this.time.tick % 60 === 0) {
      this.market.decayFatigue();
    }

    // 5. Auto-generate random events
    effects.push(...this.generateRandomEvents());

    // 6. Process queued events
    effects.push(...this.processEventQueue());

    // 7. Recalculate warehouse utilization
    this.facilities.warehouse.utilized = this.products.reduce((sum, p) => sum + p.stock, 0);

    // 8. Recalculate overall morale
    this.morale.overall = Math.round(
      Object.values(this.morale.factors).reduce((a, b) => a + b, 0) /
      Object.keys(this.morale.factors).length
    );

    // Hourly summary
    if (this.time.tick % 60 === 0) {
      log.info('Hourly summary', { tick: this.time.tick, day: this.time.simulatedDay, hour: this.time.simulatedHour, cash: Math.round(this.ledger.cash), morale: this.morale.overall, satisfaction: Math.round(this.customerSatisfaction), pendingOrders: this.orders.pending });
    }

    // Log effects
    this.effectLog.push(...effects.map(e => ({ ...e, tick: this.time.tick })));
    if (this.effectLog.length > 2000) {
      this.effectLog = this.effectLog.slice(-2000);
    }

    return {
      tick: this.time.tick,
      time: { ...this.time },
      financials,
      morale: { ...this.morale },
      customerSatisfaction: this.customerSatisfaction,
      orders: { ...this.orders },
      effects,
      isBankrupt: financials.isBankrupt,
    };
  }

  /**
   * Cleanliness chain: No cleaner → dirty office → morale drops → productivity drops
   */
  processCleanliness() {
    const effects = [];
    const hasCleaner = this.employees.some(e =>
      e.role.toLowerCase().includes('clean') || e.role.toLowerCase().includes('janitor')
    );

    if (!hasCleaner) {
      // Cleanliness decays over time
      const decayRate = 1 / 60;  // 1 point per hour
      this.facilities.office.cleanlinessScore = Math.max(0,
        this.facilities.office.cleanlinessScore - decayRate
      );

      if (this.facilities.office.cleanlinessScore < 50 && this.time.tick % 60 === 0) {
        effects.push({
          type: 'chain_effect',
          chain: 'cleanliness',
          message: `Office cleanliness at ${Math.round(this.facilities.office.cleanlinessScore)}% — no cleaner on staff`,
          severity: 'warning',
        });
      }

      if (this.facilities.office.cleanlinessScore < 30 && this.time.tick % 60 === 0) {
        effects.push({
          type: 'chain_effect',
          chain: 'cleanliness→morale→productivity',
          message: 'Dirty office causing morale drop — productivity reduced 15%',
          severity: 'critical',
        });
      }
    } else {
      // Cleaner restores cleanliness
      this.facilities.office.cleanlinessScore = Math.min(95,
        this.facilities.office.cleanlinessScore + 0.5 / 60  // Recovers slowly
      );
    }

    // Cleanliness affects morale
    this.morale.factors.cleanliness = Math.round(this.facilities.office.cleanlinessScore);

    return effects;
  }

  /**
   * Morale chain: Various factors → productivity modifier
   */
  processMorale() {
    const effects = [];

    // Social morale: based on average relationship quality of employees
    // (Will be fed by message-bus relationship data)
    const socialScore = this.employees.length > 1
      ? Math.min(100, 50 + this.employees.length * 3)  // Baseline, updated by relationships
      : 30;  // Lonely worker
    this.morale.factors.social = socialScore;

    // Workload: too few staff for orders = overwork
    const fulfillmentStaff = this.employees.filter(e =>
      ['fulfillment', 'warehouse', 'operations', 'shipping'].some(r =>
        e.role.toLowerCase().includes(r)
      )
    ).length;
    const orderLoad = this.orders.pending + this.orders.processing;
    if (fulfillmentStaff > 0 && orderLoad / fulfillmentStaff > 10) {
      this.morale.factors.workload = Math.max(20, this.morale.factors.workload - 0.5 / 60);
      if (this.time.tick % 120 === 0) {
        effects.push({
          type: 'chain_effect',
          chain: 'overwork→morale→errors',
          message: `Fulfillment overworked: ${orderLoad} orders, ${fulfillmentStaff} staff`,
          severity: 'warning',
        });
      }
    } else {
      // Workload morale recovers
      this.morale.factors.workload = Math.min(90, this.morale.factors.workload + 0.2 / 60);
    }

    // Low overall morale triggers effects
    if (this.morale.overall < 40 && this.time.tick % 120 === 0) {
      effects.push({
        type: 'chain_effect',
        chain: 'morale→productivity',
        message: `Company morale critically low (${this.morale.overall}%) — all productivity reduced`,
        severity: 'critical',
      });
    }

    return effects;
  }

  /**
   * Workload processing — orders move through pipeline
   */
  processOrders() {
    const effects = [];

    // Fulfillment staff process orders
    const fulfillmentStaff = this.employees.filter(e =>
      ['fulfillment', 'warehouse', 'operations', 'shipping'].some(r =>
        e.role.toLowerCase().includes(r)
      )
    );

    if (fulfillmentStaff.length > 0 && this.orders.pending > 0) {
      const productivityMod = this.getProductivityModifier();
      const processRate = fulfillmentStaff.length * productivityMod * 0.5;  // Orders/min per worker
      const processed = Math.min(this.orders.pending, Math.ceil(processRate));

      this.orders.pending -= processed;
      this.orders.processing += processed;
    }

    // Processing → Shipped (takes ~30 min per batch)
    if (this.orders.processing > 0 && this.time.tick % 30 === 0) {
      const shipped = Math.ceil(this.orders.processing * 0.5);
      this.orders.processing -= shipped;
      this.orders.shipped += shipped;
    }

    // Returns (based on error rate from morale)
    if (this.orders.shipped > 0 && this.time.tick % 60 === 0) {
      const errorRate = this.morale.overall < 40 ? 0.08 : this.morale.overall < 60 ? 0.03 : 0.01;
      const returns = Math.floor(this.orders.shipped * errorRate * Math.random());
      if (returns > 0) {
        this.orders.returned += returns;
        this.orders.shipped -= returns;
        this.customerSatisfaction = Math.max(0, this.customerSatisfaction - returns * 0.5);

        effects.push({
          type: 'chain_effect',
          chain: 'errors→returns→satisfaction',
          message: `${returns} order(s) returned — customer satisfaction now ${Math.round(this.customerSatisfaction)}%`,
          severity: 'warning',
        });
      }
    }

    return effects;
  }

  /**
   * Product decay — ratings can shift, stock can run low
   */
  processProductDecay() {
    const effects = [];

    for (const product of this.products) {
      // Low stock warning
      if (product.stock <= 10 && product.stock > 0 && this.time.tick % 60 === 0) {
        effects.push({
          type: 'stockout_warning',
          message: `Low stock: ${product.name} — only ${product.stock} units left!`,
          severity: 'warning',
          productId: product.id,
        });
      }

      // Stockout
      if (product.stock <= 0 && this.time.tick % 120 === 0) {
        effects.push({
          type: 'stockout',
          message: `OUT OF STOCK: ${product.name} — losing sales!`,
          severity: 'critical',
          productId: product.id,
        });
        // Lost sales reduce customer satisfaction
        this.customerSatisfaction = Math.max(0, this.customerSatisfaction - 0.1);
      }

      // Customer satisfaction affects ratings over time
      if (this.time.tick % 480 === 0) {  // Every ~8 hours
        const ratingDrift = (this.customerSatisfaction - 50) / 500;  // Tiny drift toward satisfaction
        product.rating = Math.max(1, Math.min(5,
          product.rating + ratingDrift + (Math.random() - 0.5) * 0.1
        ));
        product.rating = Math.round(product.rating * 10) / 10;
      }
    }

    return effects;
  }

  /**
   * Generate random business events
   */
  generateRandomEvents() {
    const effects = [];

    // Events happen roughly once every 30-120 ticks (30 min to 2 hours sim time)
    if (Math.random() > 0.985) {
      const event = this.pickRandomEvent();
      if (event) {
        log.info('Random event', { eventId: event.id, name: event.name, severity: event.severity });
        this.eventHistory.push({ ...event, tick: this.time.tick, timestamp: Date.now() });
        effects.push({
          type: 'random_event',
          event: event.id,
          message: event.description,
          severity: event.severity,
          impact: event.impact,
        });

        // Apply immediate effects
        this.applyEventEffects(event);
      }
    }

    return effects;
  }

  /**
   * Pick a random event from the pool
   */
  pickRandomEvent() {
    const events = [
      {
        id: 'order_spike',
        name: 'Order Spike',
        description: 'Viral social media post caused a surge of 30 new orders!',
        severity: 'opportunity',
        impact: { orders: 30 },
      },
      {
        id: 'supplier_delay',
        name: 'Supplier Delay',
        description: 'Main supplier reports 3-day shipping delay on restocks.',
        severity: 'warning',
        impact: { restockDelay: 3 },
      },
      {
        id: 'bad_review_viral',
        name: 'Bad Review Goes Viral',
        description: 'A negative review is trending — customer satisfaction dropping!',
        severity: 'critical',
        impact: { customerSatisfaction: -10, rating: -0.3 },
      },
      {
        id: 'competitor_price_drop',
        name: 'Competitor Price Drop',
        description: 'Main competitor just dropped prices 20% across the board.',
        severity: 'warning',
        impact: { salesVelocity: -0.2 },
      },
      {
        id: 'influencer_mention',
        name: 'Influencer Mention',
        description: 'A popular influencer mentioned your product — traffic surging!',
        severity: 'opportunity',
        impact: { orders: 15, customerSatisfaction: 5 },
      },
      {
        id: 'warehouse_issue',
        name: 'Warehouse Water Leak',
        description: 'Water leak in warehouse — 50 units of stock damaged.',
        severity: 'critical',
        impact: { stockDamage: 50 },
      },
      {
        id: 'seasonal_demand',
        name: 'Seasonal Demand Shift',
        description: 'Seasonal trends shifting — fitness products seeing increased interest.',
        severity: 'info',
        impact: { categoryBoost: 'fitness' },
      },
      {
        id: 'bulk_order',
        name: 'Corporate Bulk Order',
        description: 'Corporate client inquiring about a bulk order of 100 units.',
        severity: 'opportunity',
        impact: { orders: 100 },
      },
      {
        id: 'payment_issue',
        name: 'Payment Gateway Hiccup',
        description: 'Payment processor had a 30-min outage — some orders may have failed.',
        severity: 'warning',
        impact: { lostOrders: 5 },
      },
      {
        id: 'positive_press',
        name: 'Positive Press Coverage',
        description: 'Local news featured your eco-friendly products!',
        severity: 'opportunity',
        impact: { customerSatisfaction: 8, orders: 10 },
      },
    ];

    return events[Math.floor(Math.random() * events.length)];
  }

  /**
   * Apply the immediate effects of an event
   */
  applyEventEffects(event) {
    const impact = event.impact || {};

    if (impact.orders) {
      this.orders.pending += impact.orders;
    }
    if (impact.customerSatisfaction) {
      this.customerSatisfaction = Math.max(0, Math.min(100,
        this.customerSatisfaction + impact.customerSatisfaction
      ));
    }
    if (impact.salesVelocity) {
      for (const product of this.products) {
        product.salesVelocity = Math.max(0.1, product.salesVelocity + impact.salesVelocity);
      }
    }
    if (impact.rating) {
      const randomProduct = this.products[Math.floor(Math.random() * this.products.length)];
      if (randomProduct) {
        randomProduct.rating = Math.max(1, Math.min(5, randomProduct.rating + impact.rating));
      }
    }
    if (impact.stockDamage) {
      const randomProduct = this.products[Math.floor(Math.random() * this.products.length)];
      if (randomProduct) {
        randomProduct.stock = Math.max(0, randomProduct.stock - impact.stockDamage);
      }
    }
    if (impact.categoryBoost) {
      for (const product of this.products) {
        if (product.category === impact.categoryBoost) {
          product.salesVelocity = Math.min(3, product.salesVelocity + 0.3);
        }
      }
    }
    if (impact.lostOrders) {
      this.orders.pending = Math.max(0, this.orders.pending - impact.lostOrders);
    }
  }

  /**
   * Inject a manual event from the UI
   */
  injectEvent(eventData) {
    const event = {
      id: eventData.id || `manual_${Date.now()}`,
      name: eventData.name || 'Manual Event',
      description: eventData.description,
      severity: eventData.severity || 'info',
      impact: eventData.impact || {},
      manual: true,
    };

    this.eventHistory.push({ ...event, tick: this.time.tick, timestamp: Date.now() });
    this.applyEventEffects(event);

    return event;
  }

  /**
   * Process queued events
   */
  processEventQueue() {
    const effects = [];
    const toProcess = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of toProcess) {
      this.applyEventEffects(event);
      this.eventHistory.push({ ...event, tick: this.time.tick, timestamp: Date.now() });
      effects.push({
        type: 'queued_event',
        event: event.id,
        message: event.description,
        severity: event.severity,
      });
    }

    return effects;
  }

  /**
   * Get overall productivity modifier based on morale and conditions
   */
  getProductivityModifier() {
    let mod = 1.0;

    // Morale effect
    if (this.morale.overall < 30) mod *= 0.6;
    else if (this.morale.overall < 50) mod *= 0.75;
    else if (this.morale.overall < 70) mod *= 0.9;
    else if (this.morale.overall > 85) mod *= 1.1;

    // Cleanliness effect
    if (this.facilities.office.cleanlinessScore < 30) mod *= 0.85;
    else if (this.facilities.office.cleanlinessScore < 50) mod *= 0.93;

    return Math.round(mod * 100) / 100;
  }

  /**
   * Add an employee (called when lead agent hires)
   */
  addEmployee(employee) {
    this.employees.push({
      ...employee,
      hiredAt: this.time.tick,
      morale: 80,           // New hires start optimistic
      productivity: 0.7,     // Ramp-up period
    });
    log.info('Employee added', { id: employee.id, name: employee.name, role: employee.role });
  }

  /**
   * Remove an employee (called when lead agent fires/retires)
   */
  removeEmployee(employeeId) {
    const idx = this.employees.findIndex(e => e.id === employeeId);
    if (idx === -1) return null;
    const removed = this.employees.splice(idx, 1)[0];
    log.info('Employee removed', { id: employeeId, name: removed.name, role: removed.role });

    // Firing affects morale of remaining staff
    const moraleHit = removed.relationships
      ? Object.values(removed.relationships).filter(r => r.familiarity > 0.5).length * 2
      : 1;
    this.morale.factors.management = Math.max(20,
      this.morale.factors.management - moraleHit
    );

    return removed;
  }

  /**
   * Restock a product
   */
  restockProduct(productId, quantity, costPerUnit) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return null;

    const totalCost = quantity * costPerUnit;
    this.ledger.recordExpense(this.time.tick, totalCost, 'inventory', {
      productId, quantity, costPerUnit,
    });

    product.stock += quantity;
    log.info('Product restocked', { productId, quantity, totalCost });
    return { product: product.name, quantity, totalCost };
  }

  /**
   * Get full world state for lead agent context
   */
  getState() {
    return {
      company: this.company,
      financials: this.ledger.getState(this.employees),
      products: this.products.map(p => ({
        ...p,
        stockStatus: p.stock <= 0 ? 'OUT_OF_STOCK' : p.stock <= 10 ? 'LOW' : 'OK',
      })),
      employees: this.employees.map(e => ({
        id: e.id,
        name: e.name,
        role: e.role,
        tier: e.tier,
        hourlyRate: e.hourlyRate,
        morale: e.morale,
        productivity: e.productivity,
        hiredAt: e.hiredAt,
        skills: e.skills || [],
      })),
      facilities: this.facilities,
      morale: this.morale,
      customerSatisfaction: Math.round(this.customerSatisfaction),
      orders: this.orders,
      channels: this.market.getChannelStats(),
      customerSegments: this.market.getSegmentStats(),
      campaignSummary: this.market.getCampaignSummary(),
      productivityModifier: this.getProductivityModifier(),
      time: this.time,
      recentEvents: this.eventHistory.slice(-10),
      recentEffects: this.effectLog.slice(-20),
    };
  }

  /**
   * Get a compact state summary (for agent context to save tokens)
   */
  getCompactState() {
    const fin = this.ledger.getState(this.employees);
    return {
      day: this.time.simulatedDay,
      hour: this.time.simulatedHour,
      cash: fin.cash,
      burnPerHour: fin.burnRate.perHour,
      runwayDays: fin.runway.days,
      employees: this.employees.length,
      morale: this.morale.overall,
      satisfaction: Math.round(this.customerSatisfaction),
      pendingOrders: this.orders.pending,
      productsLow: this.products.filter(p => p.stock <= 10).map(p => p.name),
      productsOut: this.products.filter(p => p.stock <= 0).map(p => p.name),
      revenueToday: fin.revenue.today,
    };
  }

  /**
   * Get active campaign spend per minute
   */
  getActiveCampaignSpendPerMin() {
    return this.market.activeCampaigns.reduce((sum, c) => {
      return sum + (c.budgetRemaining / Math.max(1, c.durationRemaining));
    }, 0);
  }
}

module.exports = WorldEngine;
