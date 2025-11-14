const express = require('express');
const router = express.Router();
const mqttClient = require('../mqtt/client');
const GROUP = process.env.GROUP || 'grupoX';

/**
 * @swagger
 * tags:
 *   - name: Laboratorio
 *     description: Eventos de simulação do cenário de laboratório
 */

/**
 * @swagger
 * /api/lab/trigger:
 *   post:
 *     summary: Simula um evento do laboratório (senha, porta, temperatura)
 *     tags: [Laboratorio]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [passwordOk, passwordFail, doorOpen, doorClose, tempHigh, tempNormal]
 *     responses:
 *       200: { description: Evento simulado }
 *       400: { description: Erro de validação }
 */
router.post('/lab/trigger', (req, res) => {
  const { event } = req.body || {};
  if (!event) return res.status(400).json({ error: 'event requerido' });

  try {
    switch (event) {
      case 'passwordOk':
        publishWithDuration('vibracao', process.env.LAB_VIB_PIN || 26, 'ON', 1000);
        publishWithDuration('led', process.env.LAB_LED_GREEN_PIN || 15, 'ON', 3000);
        publishWithDuration('rele', process.env.LAB_RELAY_PIN || 27, 'ON', 1500);
        break;
      case 'passwordFail':
        publishWithDuration('vibracao', process.env.LAB_VIB_PIN || 26, 'ON', 3000);
        publishWithDuration('led', process.env.LAB_LED_RED_PIN || 4, 'ON', 3000);
        break;
      case 'doorOpen':
        mqttClient.publish(`${GROUP}/sensor/encoder/sw${process.env.LAB_ENCODER_PIN || 14}/state`, 'OPEN');
        break;
      case 'doorClose':
        mqttClient.publish(`${GROUP}/sensor/encoder/sw${process.env.LAB_ENCODER_PIN || 14}/state`, 'CLOSED');
        mqttClient.publish(`${GROUP}/atuador/led/${process.env.LAB_LED_GREEN_PIN || 15}`, 'OFF');
        mqttClient.publish(`${GROUP}/atuador/led/${process.env.LAB_LED_RED_PIN || 4}`, 'OFF');
        break;
      case 'tempHigh':
        mqttClient.publish(`${GROUP}/sensor/dht11/sw${process.env.LAB_TEMP_PIN || 4}/reading`, JSON.stringify({ temperature: (Number(process.env.LAB_TEMP_LIMIT) || 30) + 5, humidity: 60 }));
        break;
      case 'tempNormal':
        mqttClient.publish(`${GROUP}/sensor/dht11/sw${process.env.LAB_TEMP_PIN || 4}/reading`, JSON.stringify({ temperature: (Number(process.env.LAB_TEMP_LIMIT) || 30) - 2, humidity: 55 }));
        break;
      default:
        return res.status(400).json({ error: 'event inválido' });
    }
    return res.json({ message: 'Evento simulado', event });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao simular', details: String(err) });
  }
});

function publishWithDuration(tipo, pino, command, durationMs) {
  const topic = `${GROUP}/atuador/${tipo}/${pino}`;
  mqttClient.publish(topic, command);
  if (command === 'ON' && durationMs && durationMs > 0) {
    setTimeout(() => mqttClient.publish(topic, 'OFF'), durationMs);
  }
}

module.exports = router;