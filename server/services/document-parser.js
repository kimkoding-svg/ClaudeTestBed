/**
 * Document Parser Service
 *
 * Parses uploaded files (Excel, Word, PDF) and extracts financial data.
 */
const ExcelJS = require('exceljs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const log = require('../logger').child('DOC-PARSER');

/**
 * Parse a document buffer based on file type
 */
async function parseDocument(buffer, filename, mimeType) {
  const ext = filename.toLowerCase().split('.').pop();

  log.info('Parsing document', { filename, ext, size: buffer.length });

  switch (ext) {
    case 'xlsx':
    case 'xls':
      return await parseExcel(buffer, filename);
    case 'csv':
      return await parseCSV(buffer, filename);
    case 'docx':
      return await parseWord(buffer, filename);
    case 'pdf':
      return await parsePDF(buffer, filename);
    default:
      log.warn('Unsupported file type', { filename, ext });
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

/**
 * Parse Excel file
 */
async function parseExcel(buffer, filename) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets = [];
  let allRows = [];

  workbook.eachSheet((worksheet, sheetId) => {
    const sheetData = {
      name: worksheet.name,
      rows: [],
      headers: [],
    };

    let headerRow = null;
    worksheet.eachRow((row, rowNumber) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
      });

      if (rowNumber === 1) {
        headerRow = values;
        sheetData.headers = values;
      } else {
        const rowObj = {};
        values.forEach((val, idx) => {
          const header = headerRow && headerRow[idx] ? headerRow[idx] : `col_${idx}`;
          rowObj[header] = val;
        });
        sheetData.rows.push(rowObj);
        allRows.push(rowObj);
      }
    });

    sheets.push(sheetData);
  });

  // Try to extract financial data
  const financial = extractFinancialData(allRows, sheets[0]?.headers || []);

  return {
    filename,
    fileType: 'excel',
    sheets: sheets.map(s => ({ name: s.name, headers: s.headers, rowCount: s.rows.length })),
    rows: allRows.length,
    income: financial.income,
    expenses: financial.expenses,
    rawText: allRows.map(row => Object.values(row).join(' | ')).join('\n'),
    rawData: allRows.slice(0, 100), // First 100 rows for Claude to analyze
  };
}

/**
 * Parse CSV file (treat as single-sheet Excel)
 */
async function parseCSV(buffer, filename) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { filename, fileType: 'csv', rows: 0, income: [], expenses: [], rawText: '' };
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    values.forEach((val, idx) => {
      row[headers[idx] || `col_${idx}`] = val;
    });
    rows.push(row);
  }

  const financial = extractFinancialData(rows, headers);

  return {
    filename,
    fileType: 'csv',
    headers,
    rows: rows.length,
    income: financial.income,
    expenses: financial.expenses,
    rawText: text.substring(0, 5000),
    rawData: rows.slice(0, 100),
  };
}

/**
 * Parse Word document
 */
async function parseWord(buffer, filename) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  // Try to extract financial data from text
  const financial = extractFinancialFromText(text);

  return {
    filename,
    fileType: 'word',
    rows: 0,
    income: financial.income,
    expenses: financial.expenses,
    rawText: text.substring(0, 5000),
  };
}

/**
 * Parse PDF document
 */
async function parsePDF(buffer, filename) {
  const data = await pdfParse(buffer);
  const text = data.text;

  const financial = extractFinancialFromText(text);

  return {
    filename,
    fileType: 'pdf',
    pages: data.numpages,
    rows: 0,
    income: financial.income,
    expenses: financial.expenses,
    rawText: text.substring(0, 5000),
  };
}

/**
 * Extract financial data from structured rows (Excel/CSV)
 */
function extractFinancialData(rows, headers) {
  const income = [];
  const expenses = [];

  // Normalize headers to lowercase for matching
  const lowerHeaders = headers.map(h => (h || '').toLowerCase());

  // Find amount/value columns
  const amountColIdx = lowerHeaders.findIndex(h =>
    h.includes('amount') || h.includes('value') || h.includes('total') ||
    h.includes('rand') || h.includes('zar') || h.includes('price') ||
    h.includes('salary') || h.includes('income') || h.includes('payment')
  );

  // Find description/category columns
  const descColIdx = lowerHeaders.findIndex(h =>
    h.includes('description') || h.includes('category') || h.includes('item') ||
    h.includes('name') || h.includes('type') || h.includes('detail') || h.includes('source')
  );

  // Find type/category column that indicates income vs expense
  const typeColIdx = lowerHeaders.findIndex(h =>
    h.includes('type') || h.includes('category') || h.includes('class')
  );

  for (const row of rows) {
    const values = Object.values(row);
    const keys = Object.keys(row);

    // Try to find amount
    let amount = null;
    if (amountColIdx >= 0 && keys[amountColIdx]) {
      amount = parseFloat(String(row[keys[amountColIdx]]).replace(/[^0-9.-]/g, ''));
    } else {
      // Look for any numeric value
      for (const val of values) {
        const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(num) && num !== 0) {
          amount = num;
          break;
        }
      }
    }

    if (amount === null || isNaN(amount)) continue;

    // Get description
    let description = 'Unknown item';
    if (descColIdx >= 0 && keys[descColIdx]) {
      description = String(row[keys[descColIdx]]);
    } else {
      // Use first non-numeric value
      for (const val of values) {
        if (val && isNaN(parseFloat(val)) && String(val).length > 1) {
          description = String(val);
          break;
        }
      }
    }

    // Classify as income or expense
    let isIncome = amount > 0;
    if (typeColIdx >= 0 && keys[typeColIdx]) {
      const type = String(row[keys[typeColIdx]]).toLowerCase();
      if (type.includes('income') || type.includes('revenue') || type.includes('salary') || type.includes('receipt')) {
        isIncome = true;
      } else if (type.includes('expense') || type.includes('cost') || type.includes('deduction') || type.includes('payment')) {
        isIncome = false;
      }
    }

    const item = { description, amount: Math.abs(amount) };

    if (isIncome) {
      income.push(item);
    } else {
      expenses.push(item);
    }
  }

  return { income, expenses };
}

/**
 * Extract financial data from unstructured text (Word/PDF)
 */
function extractFinancialFromText(text) {
  const income = [];
  const expenses = [];

  // Look for patterns like "R 50,000" or "R50000" or "ZAR 50,000"
  const amountPattern = /(?:R|ZAR)\s*(\d[\d,\s]*(?:\.\d{2})?)/gi;
  const matches = text.matchAll(amountPattern);

  for (const match of matches) {
    const amount = parseFloat(match[1].replace(/[,\s]/g, ''));
    if (!isNaN(amount) && amount > 0) {
      // Get surrounding text as description
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      const context = text.substring(start, end).replace(/\n/g, ' ').trim();

      income.push({
        description: context,
        amount,
        raw: match[0],
      });
    }
  }

  return { income, expenses };
}

module.exports = {
  parseDocument,
  parseExcel,
  parseCSV,
  parseWord,
  parsePDF,
};
