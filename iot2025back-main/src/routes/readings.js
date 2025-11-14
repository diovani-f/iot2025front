const express = require('express');
const router = express.Router();
const Reading = require('../models/Reading');

// Util para gerar CSV simples
function toCSV(rows) {
  if (!rows.length) return 'espId,tipo,pino,timestamp\n';
  const header = 'espId,tipo,pino,timestamp,' + Object.keys(rows[0].data || {}).join(',');
  const lines = rows.map(r => {
    const dataKeys = Object.keys(r.data || {});
    const dataVals = dataKeys.map(k => JSON.stringify(r.data[k]));
    return [r.espId, r.tipo || '', r.pino ?? '', r.timestamp?.toISOString(), ...dataVals].join(',');
  });
  return header + '\n' + lines.join('\n');
}

/**
 * @swagger
 * /api/readings/{espId}:
 *   get:
 *     tags: [Leituras]
 *     summary: Lista as leituras recebidas de uma placa ESP32
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador da placa ESP32
 *     responses:
 *       200:
 *         description: Lista de leituras
 */
router.get('/readings/:espId', async (req, res) => {
  try {
    const readings = await Reading.find({ espId: req.params.espId }).sort({ timestamp: -1 });
    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar leituras' });
  }
});

/**
 * @swagger
 * /api/readings/export/{espId}:
 *   get:
 *     tags: [Leituras]
 *     summary: Exporta leituras em CSV
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *         description: Número máximo de registros (padrão 100)
 *     responses:
 *       200: { description: CSV de leituras }
 */
router.get('/readings/export/:espId', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 5000);
  try {
    const readings = await Reading.find({ espId: req.params.espId }).sort({ timestamp: -1 }).limit(limit);
    const csv = toCSV(readings.reverse()); // ordem cronológica
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.espId}_readings.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao exportar leituras', details: String(err) });
  }
});

module.exports = router;
