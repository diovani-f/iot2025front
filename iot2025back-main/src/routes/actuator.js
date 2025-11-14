const express = require('express');
const router = express.Router();
const mqttClient = require('../mqtt/client');
const GROUP = process.env.GROUP || 'grupoX';

// POST /api/actuator
router.post('/', (req, res) => {
  const { tipo, pin, command } = req.body;

  if (!tipo || !pin || !command) {
    return res.status(400).json({ error: 'Dados inválidos para atuador.' });
  }

  // Exemplo: grupoX/atuador/rele/2
  const topic = `${GROUP}/atuador/${tipo}/${pin}`;

  mqttClient.publish(topic, command); // "ON" ou "OFF"
  console.log(`📡 Comando enviado para ${topic}: ${command}`);

  res.json({ message: 'Comando enviado com sucesso' });
});

module.exports = router;
