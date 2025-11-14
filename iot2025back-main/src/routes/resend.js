const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const mqttClient = require('../mqtt/client');

const GROUP = process.env.GROUP || 'grupoX';

const mapModelToTipo = (model = '') => {
  switch (String(model).toUpperCase()) {
    case 'KY-023':
      return 'joystick_ky023';
    case 'DHT11':
      return 'dht11';
    case 'MPU6050':
      return 'mpu6050';
    case 'DS18B20':
      return 'ds18b20';
    case 'HCSR04':
      return 'hcsr04';
    case 'IR_RECEIVER':
      return 'ir_receiver';
    case 'KEYPAD':
      return 'keypad';
    case 'APDS9960':
      return 'apds9960';
    case 'BOTAO':
      return 'botao';
    case 'ENCODER':
      return 'encoder';
    case 'LED':
      return 'led';
    case 'RELE':
      return 'rele';
    case 'VIB':
    case 'VIBRACAO':
      return 'vibracao';
    default:
      return String(model || '').toLowerCase();
  }
};

/**
 * @swagger
 * /api/device/{espId}/resend:
 *   post:
 *     tags: [Dispositivos]
 *     summary: Reenvia a configuração MQTT para o dispositivo
 *     parameters:
 *       - in: path
 *         name: espId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador único da placa ESP32
 *     responses:
 *       200:
 *         description: Configuração reenviada com sucesso
 *         content:
 *           application/json:
 *             example:
 *               message: Configuração reenviada com sucesso
 *       404:
 *         description: Dispositivo não encontrado
 */
router.post('/device/:espId/resend', async (req, res) => {
  try {
    const device = await Device.findOne({ espId: req.params.espId });
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' });

    const topic = `${GROUP}/config`;
    (device.components || []).forEach((component) => {
      if (typeof component.pin !== 'number') return;
      const tipo = mapModelToTipo(component.model);
      const payload = {
        comando: 'ADD',
        tipo,
        pino: component.pin
      };
      mqttClient.publish(topic, JSON.stringify(payload));
    });

    res.json({ message: 'Configuração reenviada com sucesso' });
  } catch (error) {
    console.error('Erro ao reenviar configuração:', error);
    res.status(500).json({ error: 'Erro ao reenviar configuração' });
  }
});

module.exports = router;
