/**
 * Financial Ledger — Tracks all money flows in the business simulation.
 * Budget, payroll, expenses, revenue, burn rate — all calculated per minute.
 */

const log = require('../logger').child('FINANCE');

class FinancialLedger {
  constructor(startingCash = 500000) {
    this.cash = startingCash;
    this.startingCash = startingCash;

    // Revenue tracking
    this.revenue = {
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      history: [],  // { tick, amount, source, details }
    };

    // Expense tracking
    this.expenses = {
      total: 0,
      payroll: 0,
      facilities: 0,
      marketing: 0,
      inventory: 0,
      other: 0,
      history: [],  // { tick, amount, category, details }
    };

    // Facilities (fixed monthly costs → converted to per-minute)
    this.facilities = {
      officeRent: 3000,     // $/month
      warehouseRent: 2000,  // $/month
      utilities: 500,       // $/month
      internet: 200,        // $/month
    };

    // Snapshot history for graphs
    this.snapshots = [];  // { tick, cash, burnRate, revenue, netRate }
  }

  /**
   * Employee tier wage rates ($/hour)
   */
  static WAGE_RATES = {
    executive:  85,
    management: 55,
    specialist: 40,
    operations: 22,
    support:    18,
    facilities: 15,
  };

  /**
   * Get per-minute wage for a tier
   */
  static getPerMinuteWage(tier) {
    const hourly = FinancialLedger.WAGE_RATES[tier] || 20;
    return hourly / 60;
  }

  /**
   * Get per-minute wage for a specific hourly rate
   */
  static hourlyToPerMinute(hourlyRate) {
    return hourlyRate / 60;
  }

  /**
   * Calculate total payroll burn rate ($/min) for a list of employees
   */
  calculatePayrollPerMinute(employees) {
    return employees.reduce((sum, emp) => {
      return sum + (emp.hourlyRate / 60);
    }, 0);
  }

  /**
   * Calculate facilities burn rate ($/min)
   * Monthly costs → per minute (assumes 30 days, 24/7 cost)
   */
  calculateFacilitiesPerMinute() {
    const monthlyTotal = Object.values(this.facilities).reduce((a, b) => a + b, 0);
    return monthlyTotal / (30 * 24 * 60);  // $/min
  }

  /**
   * Calculate total burn rate ($/min) including all expenses
   */
  calculateBurnRate(employees, activeCampaignSpendPerMin = 0) {
    const payroll = this.calculatePayrollPerMinute(employees);
    const facilities = this.calculateFacilitiesPerMinute();
    return payroll + facilities + activeCampaignSpendPerMin;
  }

  /**
   * Calculate runway in days at current burn rate
   */
  calculateRunway(burnRatePerMin) {
    if (burnRatePerMin <= 0) return Infinity;
    const minutesLeft = this.cash / burnRatePerMin;
    return minutesLeft / (24 * 60);  // Convert to days
  }

  /**
   * Process a tick — deduct expenses, update tracking
   */
  processTick(tick, employees, activeCampaignSpendPerMin = 0) {
    const payrollPerMin = this.calculatePayrollPerMinute(employees);
    const facilitiesPerMin = this.calculateFacilitiesPerMinute();
    const totalBurnPerMin = payrollPerMin + facilitiesPerMin + activeCampaignSpendPerMin;

    // Deduct from cash
    this.cash -= totalBurnPerMin;

    // Track expenses
    this.expenses.total += totalBurnPerMin;
    this.expenses.payroll += payrollPerMin;
    this.expenses.facilities += facilitiesPerMin;
    this.expenses.marketing += activeCampaignSpendPerMin;

    // Calculate revenue rate (rolling average over last 60 ticks = 1 hour)
    const recentRevenue = this.revenue.history
      .filter(r => r.tick >= tick - 60)
      .reduce((sum, r) => sum + r.amount, 0);
    const revenuePerMin = recentRevenue / Math.min(60, Math.max(1, tick));

    // Take snapshot every 10 ticks
    if (tick % 10 === 0) {
      this.snapshots.push({
        tick,
        cash: this.cash,
        burnRate: totalBurnPerMin,
        revenueRate: revenuePerMin,
        netRate: revenuePerMin - totalBurnPerMin,
        employees: employees.length,
      });
      // Keep last 500 snapshots
      if (this.snapshots.length > 500) {
        this.snapshots = this.snapshots.slice(-500);
      }
    }

    // Critical warnings
    if (this.cash <= 0) {
      log.error('BANKRUPT', { cash: this.cash, burnRate: totalBurnPerMin });
    } else {
      const runwayDays = this.calculateRunway(totalBurnPerMin);
      if (runwayDays < 3 && runwayDays > 0 && tick % 60 === 0) {
        log.warn('Low runway', { days: Math.round(runwayDays * 10) / 10, cash: Math.round(this.cash) });
      }
    }

    return {
      cashRemaining: this.cash,
      burnRatePerMin: totalBurnPerMin,
      payrollPerMin,
      facilitiesPerMin,
      marketingPerMin: activeCampaignSpendPerMin,
      revenuePerMin,
      netPerMin: revenuePerMin - totalBurnPerMin,
      runway: this.calculateRunway(totalBurnPerMin),
      isBankrupt: this.cash <= 0,
    };
  }

  /**
   * Record revenue from a sale or campaign result
   */
  recordRevenue(tick, amount, source, details = {}) {
    this.cash += amount;
    this.revenue.total += amount;
    this.revenue.today += amount;
    this.revenue.thisWeek += amount;
    this.revenue.thisMonth += amount;
    this.revenue.history.push({ tick, amount, source, details, timestamp: Date.now() });

    // Keep last 5000 revenue entries
    if (this.revenue.history.length > 5000) {
      this.revenue.history = this.revenue.history.slice(-5000);
    }
  }

  /**
   * Record a one-time expense (e.g., inventory purchase, campaign budget)
   */
  recordExpense(tick, amount, category, details = {}) {
    this.cash -= amount;
    this.expenses.total += amount;
    this.expenses[category] = (this.expenses[category] || 0) + amount;
    this.expenses.history.push({ tick, amount, category, details, timestamp: Date.now() });

    // Keep last 5000 expense entries
    if (this.expenses.history.length > 5000) {
      this.expenses.history = this.expenses.history.slice(-5000);
    }
  }

  /**
   * Reset daily/weekly/monthly counters (called by world engine at appropriate ticks)
   */
  resetDaily() {
    this.revenue.today = 0;
  }

  resetWeekly() {
    this.revenue.thisWeek = 0;
  }

  resetMonthly() {
    this.revenue.thisMonth = 0;
  }

  /**
   * Get full financial state for display / lead agent context
   */
  getState(employees = []) {
    const payrollPerMin = this.calculatePayrollPerMinute(employees);
    const facilitiesPerMin = this.calculateFacilitiesPerMinute();
    const burnRate = payrollPerMin + facilitiesPerMin;

    return {
      cash: Math.round(this.cash * 100) / 100,
      startingCash: this.startingCash,
      burnRate: {
        total: Math.round(burnRate * 10000) / 10000,
        payroll: Math.round(payrollPerMin * 10000) / 10000,
        facilities: Math.round(facilitiesPerMin * 10000) / 10000,
        perHour: Math.round(burnRate * 60 * 100) / 100,
        perDay: Math.round(burnRate * 60 * 24 * 100) / 100,
      },
      revenue: {
        total: Math.round(this.revenue.total * 100) / 100,
        today: Math.round(this.revenue.today * 100) / 100,
        thisWeek: Math.round(this.revenue.thisWeek * 100) / 100,
        thisMonth: Math.round(this.revenue.thisMonth * 100) / 100,
      },
      expenses: {
        total: Math.round(this.expenses.total * 100) / 100,
        payroll: Math.round(this.expenses.payroll * 100) / 100,
        facilities: Math.round(this.expenses.facilities * 100) / 100,
        marketing: Math.round(this.expenses.marketing * 100) / 100,
        inventory: Math.round(this.expenses.inventory * 100) / 100,
      },
      runway: {
        minutes: burnRate > 0 ? Math.round(this.cash / burnRate) : Infinity,
        days: burnRate > 0 ? Math.round((this.cash / burnRate) / (24 * 60) * 10) / 10 : Infinity,
      },
      payrollBreakdown: employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        role: emp.role,
        hourlyRate: emp.hourlyRate,
        perMinute: Math.round((emp.hourlyRate / 60) * 10000) / 10000,
        perDay: Math.round(emp.hourlyRate * 24 * 100) / 100,
      })),
      snapshots: this.snapshots.slice(-50),  // Last 50 for charts
      isBankrupt: this.cash <= 0,
    };
  }
}

module.exports = FinancialLedger;
