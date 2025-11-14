const express = require('express');
const router = express.Router();
const Device = require('../models/Device');

/**
 * @swagger
 * tags:
 *   - name: Dispositivos
 *     description: Operações sobre dispositivos (ESP32) e seus componentes
 */

/**
 * @swagger
 * /api/devices:
 *   get:
 *     summary: Lista todos os dispositivos
 *     tags: [Dispositivos]
 *     responses:
 *       200:
 *         description: Lista de dispositivos
 */
router.get('/devices', async (_req, res) => {
  try {
    const devices = await Device.find();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar dispositivos', details: String(err) });
  }
});

/**
 * @swagger
 * /api/devices/{espId}:
 *   get:
 *     summary: Obtém um dispositivo pelo espId
 *     tags: [Dispositivos]
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dispositivo encontrado
 *       404:
 *         description: Não encontrado
 */
router.get('/devices/:espId', async (req, res) => {
  try {
    const device = await Device.findOne({ espId: req.params.espId });
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dispositivo', details: String(err) });
  }
});

/**
 * @swagger
 * /api/devices:
 *   post:
 *     summary: Cria ou atualiza um dispositivo (upsert)
 *     tags: [Dispositivos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Device'
 *     responses:
 *       200:
 *         description: Dispositivo salvo
 */
router.post('/devices', async (req, res) => {
  try {
    const { name, espId, components } = req.body || {};
    if (!name || !espId) return res.status(400).json({ error: 'name e espId são obrigatórios' });
    const device = await Device.findOneAndUpdate(
      { espId },
      { name, espId, components: Array.isArray(components) ? components : [] },
      { upsert: true, new: true }
    );
    res.json({ message: 'Dispositivo salvo', device });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar dispositivo', details: String(err) });
  }
});

/**
 * @swagger
 * /api/device/{espId}:
 *   put:
 *     summary: Atualiza parcialmente um dispositivo existente
 *     tags: [Dispositivos]
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               components: { type: array, items: { $ref: '#/components/schemas/Component' } }
 *     responses:
 *       200: { description: Dispositivo atualizado }
 *       404: { description: Não encontrado }
 */
router.put('/device/:espId', async (req, res) => {
  try {
    const { name, components } = req.body || {};
    const device = await Device.findOneAndUpdate(
      { espId: req.params.espId },
      { ...(name ? { name } : {}), ...(components ? { components } : {}) },
      { new: true }
    );
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' });
    res.json({ message: 'Dispositivo atualizado', device });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar', details: String(err) });
  }
});

/**
 * @swagger
 * /api/device/{espId}:
 *   delete:
 *     summary: Remove um dispositivo
 *     tags: [Dispositivos]
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removido }
 *       404: { description: Não encontrado }
 */
router.delete('/device/:espId', async (req, res) => {
  try {
    const deleted = await Device.findOneAndDelete({ espId: req.params.espId });
    if (!deleted) return res.status(404).json({ error: 'Dispositivo não encontrado' });
    res.json({ message: 'Dispositivo removido' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover', details: String(err) });
  }
});

/**
 * @swagger
 * /api/configure:
 *   post:
 *     summary: Alias para criação/atualização de dispositivo
 *     tags: [Dispositivos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Device'
 *     responses:
 *       200: { description: Dispositivo salvo }
 */
router.post('/configure', async (req, res) => {
  try {
    const { name, espId, components } = req.body || {};
    if (!name || !espId) return res.status(400).json({ error: 'name e espId são obrigatórios' });
    const device = await Device.findOneAndUpdate(
      { espId },
      { name, espId, components: Array.isArray(components) ? components : [] },
      { upsert: true, new: true }
    );
    res.json({ message: 'Dispositivo salvo', device });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar dispositivo', details: String(err) });
  }
});

module.exports = router;
