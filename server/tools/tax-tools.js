/**
 * Tax Tools - Claude tool definitions and handlers
 *
 * Defines tools that Claude can call for tax calculations,
 * document analysis, and PDF generation.
 */
const taxCalc = require('./tax-calculator');
const log = require('../logger').child('TAX-TOOLS');

// Session storage for document data and generated PDFs
const sessionData = new Map();

/**
 * Tool definitions for Claude API
 */
const taxToolDefinitions = [
  {
    name: 'calculate_tax',
    description: 'Calculate South African income tax for an individual. Use this whenever someone asks about tax calculations, how much tax they owe, or wants a tax breakdown. Provide as many fields as you have gathered from the conversation.',
    input_schema: {
      type: 'object',
      properties: {
        gross_income: {
          type: 'number',
          description: 'Annual gross income in Rands',
        },
        age: {
          type: 'number',
          description: 'Age of the taxpayer (affects rebates and thresholds). Default: 30',
        },
        retirement_contributions: {
          type: 'number',
          description: 'Annual retirement fund contributions (pension, provident, RA) in Rands',
        },
        medical_members: {
          type: 'number',
          description: 'Number of people on medical aid (main member + dependants)',
        },
        medical_expenses: {
          type: 'number',
          description: 'Total qualifying out-of-pocket medical expenses for the year in Rands',
        },
        other_deductions: {
          type: 'number',
          description: 'Other allowable deductions (home office, travel, etc.) in Rands',
        },
        capital_gains: {
          type: 'number',
          description: 'Net capital gains for the year in Rands',
        },
      },
      required: ['gross_income'],
    },
  },
  {
    name: 'calculate_vat',
    description: 'Calculate VAT (Value-Added Tax) at 15%. Can calculate from VAT-inclusive or VAT-exclusive amounts.',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'The amount in Rands',
        },
        inclusive: {
          type: 'boolean',
          description: 'True if the amount already includes VAT, false if VAT needs to be added. Default: false',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'analyze_document',
    description: 'Analyze a previously uploaded document (Excel, Word, PDF) to extract financial data. Use document_id from the upload response.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'The document ID returned from the upload endpoint',
        },
        extraction_type: {
          type: 'string',
          enum: ['income', 'expenses', 'full_summary', 'raw_text'],
          description: 'What type of data to extract: income items, expense items, full financial summary, or raw text',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'generate_tax_document',
    description: 'Generate a PDF tax summary document for the taxpayer. Call this after you have calculated their tax and have all the information needed. Returns a download URL.',
    input_schema: {
      type: 'object',
      properties: {
        taxpayer_name: {
          type: 'string',
          description: 'Full name of the taxpayer',
        },
        tax_year: {
          type: 'string',
          description: 'Tax year, e.g. "2024-2025"',
        },
        gross_income: {
          type: 'number',
          description: 'Annual gross income',
        },
        taxable_income: {
          type: 'number',
          description: 'Taxable income after deductions',
        },
        tax_payable: {
          type: 'number',
          description: 'Final tax payable amount',
        },
        age: {
          type: 'number',
          description: 'Taxpayer age',
        },
        deductions: {
          type: 'object',
          description: 'Object with deduction items and amounts',
        },
        credits: {
          type: 'object',
          description: 'Object with credit items and amounts',
        },
        calculation_details: {
          type: 'object',
          description: 'Full calculation breakdown from calculate_tax',
        },
      },
      required: ['taxpayer_name', 'gross_income', 'tax_payable'],
    },
  },
];

/**
 * Handle tool calls from Claude
 */
async function handleToolCall(toolName, input) {
  log.info('Tax tool called', { toolName, input: JSON.stringify(input).substring(0, 200) });

  switch (toolName) {
    case 'calculate_tax':
      return handleCalculateTax(input);
    case 'calculate_vat':
      return handleCalculateVAT(input);
    case 'analyze_document':
      return handleAnalyzeDocument(input);
    case 'generate_tax_document':
      return handleGenerateTaxDocument(input);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

function handleCalculateTax(input) {
  const result = taxCalc.calculateFullTax({
    grossIncome: input.gross_income,
    age: input.age || 30,
    retirementContributions: input.retirement_contributions || 0,
    medicalMembers: input.medical_members || 1,
    medicalExpenses: input.medical_expenses || 0,
    otherDeductions: input.other_deductions || 0,
    capitalGains: input.capital_gains || 0,
  });

  return result;
}

function handleCalculateVAT(input) {
  return taxCalc.calculateVAT(input.amount, input.inclusive || false);
}

function handleAnalyzeDocument(input) {
  const docData = sessionData.get(`doc_${input.document_id}`);
  if (!docData) {
    return {
      error: 'Document not found. The document may have expired or the ID is incorrect. Ask the user to re-upload.',
    };
  }

  const extractionType = input.extraction_type || 'full_summary';

  switch (extractionType) {
    case 'income':
      return {
        document_id: input.document_id,
        type: 'income',
        items: docData.income || [],
        total: (docData.income || []).reduce((sum, item) => sum + (item.amount || 0), 0),
      };
    case 'expenses':
      return {
        document_id: input.document_id,
        type: 'expenses',
        items: docData.expenses || [],
        total: (docData.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0),
      };
    case 'raw_text':
      return {
        document_id: input.document_id,
        type: 'raw_text',
        text: docData.rawText || '',
      };
    case 'full_summary':
    default:
      return {
        document_id: input.document_id,
        type: 'full_summary',
        filename: docData.filename,
        fileType: docData.fileType,
        income: docData.income || [],
        expenses: docData.expenses || [],
        totalIncome: (docData.income || []).reduce((sum, item) => sum + (item.amount || 0), 0),
        totalExpenses: (docData.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0),
        rawText: docData.rawText ? docData.rawText.substring(0, 2000) : '',
        rows: docData.rows || 0,
      };
  }
}

async function handleGenerateTaxDocument(input) {
  try {
    // Lazy-load pdf-generator to avoid startup cost
    const pdfGenerator = require('../services/pdf-generator');
    const pdfId = await pdfGenerator.generateTaxSummary(input);

    return {
      success: true,
      pdf_id: pdfId,
      download_url: `/api/pdf/${pdfId}`,
      message: `Tax summary PDF generated for ${input.taxpayer_name}. The user can download it using the link provided.`,
    };
  } catch (error) {
    log.error('PDF generation failed', { error: error.message });
    return {
      error: `Failed to generate PDF: ${error.message}`,
    };
  }
}

/**
 * Store document data for later retrieval by analyze_document tool
 */
function storeDocumentData(documentId, data) {
  sessionData.set(`doc_${documentId}`, {
    ...data,
    storedAt: Date.now(),
  });

  // Auto-expire after 30 minutes
  setTimeout(() => {
    sessionData.delete(`doc_${documentId}`);
  }, 30 * 60 * 1000);
}

module.exports = {
  taxToolDefinitions,
  handleToolCall,
  storeDocumentData,
  sessionData,
};
