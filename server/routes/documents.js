/**
 * Document Upload Routes
 *
 * Handles file uploads (Excel, Word, PDF) and stores parsed data
 * for retrieval by Claude's analyze_document tool.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { parseDocument } = require('../services/document-parser');
const { storeDocumentData } = require('../tools/tax-tools');
const log = require('../logger').child('DOCUMENTS');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf', // .pdf
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv', '.docx', '.pdf'];
    const ext = '.' + file.originalname.toLowerCase().split('.').pop();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext}). Accepted: Excel, CSV, Word, PDF`));
    }
  },
});

/**
 * @swagger
 * /api/documents/upload:
 *   post:
 *     summary: Upload a document for analysis
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Document uploaded and parsed
 *       400:
 *         description: Invalid file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    log.info('Document uploaded', { filename: req.file.originalname, size: req.file.size });

    // Parse the document
    const parsed = await parseDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Generate document ID and store
    const documentId = crypto.randomBytes(8).toString('hex');
    storeDocumentData(documentId, parsed);

    log.info('Document parsed', { documentId, filename: req.file.originalname, rows: parsed.rows || 0, incomeItems: parsed.income?.length || 0, expenseItems: parsed.expenses?.length || 0 });

    // Return summary to frontend
    res.json({
      success: true,
      document_id: documentId,
      filename: req.file.originalname,
      fileType: parsed.fileType,
      summary: {
        rows: parsed.rows || 0,
        pages: parsed.pages || null,
        incomeItems: parsed.income?.length || 0,
        expenseItems: parsed.expenses?.length || 0,
        totalIncome: (parsed.income || []).reduce((sum, item) => sum + (item.amount || 0), 0),
        totalExpenses: (parsed.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0),
      },
      message: `Document "${req.file.originalname}" uploaded and parsed. You can now ask Sakura to analyze it.`,
    });

  } catch (error) {
    log.error('Document upload error', { error: error.message });
    res.status(500).json({
      error: error.message || 'Failed to process document',
    });
  }
});

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 25MB.' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

module.exports = router;
