/**
 * PDF Download Routes
 *
 * Serves generated PDF documents for download.
 */
const express = require('express');
const router = express.Router();
const { getPDF } = require('../services/pdf-generator');
const log = require('../logger').child('PDF');

/**
 * @swagger
 * /api/pdf/{id}:
 *   get:
 *     summary: Download a generated PDF
 *     tags: [PDF]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: PDF document ID
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF not found or expired
 */
router.get('/:id', (req, res) => {
  const pdfId = req.params.id;
  const pdfData = getPDF(pdfId);

  if (!pdfData) {
    log.warn('PDF not found or expired', { pdfId });
    return res.status(404).json({
      error: 'PDF not found. It may have expired (PDFs are available for 30 minutes after generation).',
    });
  }

  log.info('PDF served', { pdfId, filename: pdfData.filename, size: pdfData.bytes.length });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdfData.filename}"`);
  res.setHeader('Content-Length', pdfData.bytes.length);
  res.send(pdfData.bytes);
});

module.exports = router;
