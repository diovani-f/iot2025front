const express = require('express');
const router = express.Router();
const { readingEmitter } = require('../events');

/**
 * SSE stream de leituras em tempo real.
 * Endpoint: GET /api/stream/readings?espId=<opcional>
 */
router.get('/stream/readings', (req, res) => {
  const { espId } = req.query || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onReading = (payload) => {
    if (espId && payload.espId !== espId) return; // filtra caso espId especificado
    res.write(`event: reading\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  readingEmitter.on('reading', onReading);
  req.on('close', () => {
    readingEmitter.off('reading', onReading);
  });
});

module.exports = router;
