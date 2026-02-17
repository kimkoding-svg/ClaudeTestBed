/**
 * South African Tax Calculator
 *
 * Pure stateless functions for SARS tax computations.
 * Tax year: 2024-2025 (1 March 2024 - 28 February 2025)
 */

const TAX_BRACKETS = [
  { min: 0,       max: 237100,   rate: 0.18, base: 0 },
  { min: 237101,  max: 370500,   rate: 0.26, base: 42678 },
  { min: 370501,  max: 512800,   rate: 0.31, base: 77362 },
  { min: 512801,  max: 673000,   rate: 0.36, base: 121475 },
  { min: 673001,  max: 857900,   rate: 0.39, base: 179147 },
  { min: 857901,  max: 1817000,  rate: 0.41, base: 251258 },
  { min: 1817001, max: Infinity, rate: 0.45, base: 644489 },
];

const REBATES = {
  primary: 17235,    // All taxpayers
  secondary: 9444,   // Age 65+
  tertiary: 3145,    // Age 75+
};

const THRESHOLDS = {
  under65: 95750,
  age65to74: 148217,
  age75plus: 165689,
};

const MEDICAL_CREDITS = {
  mainMember: 364,         // per month
  firstDependant: 364,     // per month
  additionalDependant: 246, // per month
};

const VAT_RATE = 0.15;

/**
 * Calculate income tax based on taxable income and age
 */
function calculateIncomeTax(taxableIncome, age = 30) {
  if (taxableIncome <= 0) {
    return {
      grossTax: 0,
      rebates: getApplicableRebates(age),
      totalRebates: getTotalRebates(age),
      taxPayable: 0,
      effectiveRate: 0,
      brackets: [],
      threshold: getThreshold(age),
      belowThreshold: true,
    };
  }

  // Check threshold
  const threshold = getThreshold(age);
  if (taxableIncome <= threshold) {
    return {
      grossTax: 0,
      rebates: getApplicableRebates(age),
      totalRebates: getTotalRebates(age),
      taxPayable: 0,
      effectiveRate: 0,
      brackets: [],
      threshold,
      belowThreshold: true,
    };
  }

  // Calculate gross tax using brackets
  let grossTax = 0;
  const bracketBreakdown = [];

  for (const bracket of TAX_BRACKETS) {
    if (taxableIncome >= bracket.min) {
      const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min + 1;

      if (bracket.min === 0) {
        // First bracket: simple percentage
        const amountInBracket = Math.min(taxableIncome, bracket.max);
        grossTax = amountInBracket * bracket.rate;
        bracketBreakdown.push({
          range: `R0 - R${bracket.max.toLocaleString()}`,
          rate: `${bracket.rate * 100}%`,
          taxableAmount: amountInBracket,
          tax: amountInBracket * bracket.rate,
        });
      } else if (taxableIncome >= bracket.min) {
        const amountAboveMin = Math.min(taxableIncome, bracket.max) - bracket.min + 1;
        grossTax = bracket.base + (amountAboveMin * bracket.rate);
        bracketBreakdown.push({
          range: `R${bracket.min.toLocaleString()} - R${bracket.max === Infinity ? '∞' : bracket.max.toLocaleString()}`,
          rate: `${bracket.rate * 100}%`,
          taxableAmount: amountAboveMin,
          tax: bracket.base + (amountAboveMin * bracket.rate),
          base: bracket.base,
        });
      }
    }
  }

  // Apply rebates
  const rebates = getApplicableRebates(age);
  const totalRebates = getTotalRebates(age);
  const taxPayable = Math.max(0, grossTax - totalRebates);

  return {
    taxableIncome,
    grossTax: Math.round(grossTax * 100) / 100,
    rebates,
    totalRebates,
    taxPayable: Math.round(taxPayable * 100) / 100,
    effectiveRate: Math.round((taxPayable / taxableIncome) * 10000) / 100,
    brackets: bracketBreakdown,
    threshold,
    belowThreshold: false,
  };
}

/**
 * Get applicable rebates for a given age
 */
function getApplicableRebates(age) {
  const result = [{ name: 'Primary rebate', amount: REBATES.primary }];
  if (age >= 65) {
    result.push({ name: 'Secondary rebate (65+)', amount: REBATES.secondary });
  }
  if (age >= 75) {
    result.push({ name: 'Tertiary rebate (75+)', amount: REBATES.tertiary });
  }
  return result;
}

/**
 * Get total rebate amount for a given age
 */
function getTotalRebates(age) {
  let total = REBATES.primary;
  if (age >= 65) total += REBATES.secondary;
  if (age >= 75) total += REBATES.tertiary;
  return total;
}

/**
 * Get tax threshold for a given age
 */
function getThreshold(age) {
  if (age >= 75) return THRESHOLDS.age75plus;
  if (age >= 65) return THRESHOLDS.age65to74;
  return THRESHOLDS.under65;
}

/**
 * Calculate VAT
 */
function calculateVAT(amount, inclusive = false) {
  if (inclusive) {
    const exclusive = amount / (1 + VAT_RATE);
    const vat = amount - exclusive;
    return {
      inclusive: Math.round(amount * 100) / 100,
      exclusive: Math.round(exclusive * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      rate: `${VAT_RATE * 100}%`,
    };
  } else {
    const vat = amount * VAT_RATE;
    const inclusive = amount + vat;
    return {
      exclusive: Math.round(amount * 100) / 100,
      inclusive: Math.round(inclusive * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      rate: `${VAT_RATE * 100}%`,
    };
  }
}

/**
 * Calculate medical tax credits
 */
function calculateMedicalCredits(members = 1, age = 30, qualifyingExpenses = 0, taxableIncome = 0) {
  // Monthly credits
  let monthlyCredit = MEDICAL_CREDITS.mainMember; // main member
  if (members >= 2) {
    monthlyCredit += MEDICAL_CREDITS.firstDependant; // first dependant
  }
  if (members > 2) {
    monthlyCredit += (members - 2) * MEDICAL_CREDITS.additionalDependant; // additional dependants
  }

  const annualCredit = monthlyCredit * 12;

  // Additional medical expenses credit
  let additionalCredit = 0;
  if (qualifyingExpenses > 0) {
    if (age >= 65) {
      // 33.3% of (expenses - 3x annual credits)
      const excess = qualifyingExpenses - (3 * annualCredit);
      additionalCredit = Math.max(0, excess * 0.333);
    } else {
      // 25% of (expenses - 4x annual credits)
      const excess = qualifyingExpenses - (4 * annualCredit);
      additionalCredit = Math.max(0, excess * 0.25);
    }
  }

  return {
    monthlyCredit,
    annualCredit,
    additionalCredit: Math.round(additionalCredit * 100) / 100,
    totalCredit: Math.round((annualCredit + additionalCredit) * 100) / 100,
    members,
    breakdown: {
      mainMember: `R${MEDICAL_CREDITS.mainMember}/month`,
      dependants: members > 1 ? `${members - 1} dependant(s)` : 'None',
    },
  };
}

/**
 * Calculate retirement fund deduction
 */
function calculateRetirementDeduction(contribution, remuneration, taxableIncome) {
  const greaterOf = Math.max(remuneration, taxableIncome);
  const maxDeduction = Math.min(greaterOf * 0.275, 350000);
  const allowedDeduction = Math.min(contribution, maxDeduction);
  const excessContribution = Math.max(0, contribution - maxDeduction);

  return {
    contribution,
    maxDeductible: Math.round(maxDeduction * 100) / 100,
    allowedDeduction: Math.round(allowedDeduction * 100) / 100,
    excessCarriedForward: Math.round(excessContribution * 100) / 100,
    percentageOfIncome: `${Math.round((allowedDeduction / greaterOf) * 10000) / 100}%`,
  };
}

/**
 * Full tax calculation with all deductions and credits
 */
function calculateFullTax({
  grossIncome,
  age = 30,
  retirementContributions = 0,
  medicalMembers = 1,
  medicalExpenses = 0,
  otherDeductions = 0,
  capitalGains = 0,
}) {
  // Step 1: Retirement deduction
  const retirement = calculateRetirementDeduction(retirementContributions, grossIncome, grossIncome);

  // Step 2: Capital gains inclusion
  let cgtInclusion = 0;
  if (capitalGains > 40000) { // Annual exclusion
    cgtInclusion = (capitalGains - 40000) * 0.4; // 40% inclusion rate for individuals
  }

  // Step 3: Taxable income
  const taxableIncome = grossIncome - retirement.allowedDeduction - otherDeductions + cgtInclusion;

  // Step 4: Income tax
  const tax = calculateIncomeTax(taxableIncome, age);

  // Step 5: Medical credits
  const medical = calculateMedicalCredits(medicalMembers, age, medicalExpenses, taxableIncome);

  // Step 6: Final tax payable
  const finalTax = Math.max(0, tax.taxPayable - medical.totalCredit);

  return {
    summary: {
      grossIncome,
      retirementDeduction: retirement.allowedDeduction,
      otherDeductions,
      capitalGainsInclusion: cgtInclusion,
      taxableIncome: Math.round(taxableIncome * 100) / 100,
      grossTax: tax.grossTax,
      totalRebates: tax.totalRebates,
      taxAfterRebates: tax.taxPayable,
      medicalCredits: medical.totalCredit,
      finalTaxPayable: Math.round(finalTax * 100) / 100,
      effectiveRate: Math.round((finalTax / grossIncome) * 10000) / 100,
      monthlyTax: Math.round((finalTax / 12) * 100) / 100,
    },
    details: {
      retirement,
      tax,
      medical,
      capitalGains: capitalGains > 0 ? {
        totalGain: capitalGains,
        annualExclusion: 40000,
        inclusionRate: '40%',
        amountIncluded: cgtInclusion,
      } : null,
    },
  };
}

module.exports = {
  calculateIncomeTax,
  calculateVAT,
  calculateMedicalCredits,
  calculateRetirementDeduction,
  calculateFullTax,
  getApplicableRebates,
  getThreshold,
  TAX_BRACKETS,
  REBATES,
  THRESHOLDS,
  VAT_RATE,
};
