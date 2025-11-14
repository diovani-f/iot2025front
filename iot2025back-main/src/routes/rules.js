const express = require('express');
const router = express.Router();
const Rule = require('../models/Rule');

/**
 * @swagger
 * tags:
 *   - name: Regras
 *     description: Motor de regras (condição -> ação MQTT)
 */

/**
 * @swagger
 * /api/rules:
 *   get:
 *     summary: Lista todas as regras existentes
 *     tags: [Regras]
 *     responses:
 *       200: { description: Lista de regras }
 */
router.get('/', async (_req, res) => {
  try {
    const rules = await Rule.find();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar regras', details: String(err) });
  }
});

/**
 * @swagger
 * /api/rules:
 *   post:
 *     summary: Cria uma nova regra
 *     tags: [Regras]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               deviceId: { type: string }
 *               sensor: { type: object }
 *               condition: { type: object }
 *               action: { type: object }
 *     responses:
 *       200: { description: Regra criada }
 *       400: { description: Erro de validação }
 */
router.post('/', async (req, res) => {
  try {
    const rule = new Rule(req.body);
    await rule.save();
    res.json({ message: 'Regra criada com sucesso', rule });
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar regra', details: String(err) });
  }
});

/**
 * @swagger
 * /api/rules/{id}:
 *   delete:
 *     summary: Remove uma regra
 *     tags: [Regras]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removida }
 *       404: { description: Não encontrada }
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Rule.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json({ message: 'Regra removida com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover regra', details: String(err) });
  }
});

module.exports = router;
