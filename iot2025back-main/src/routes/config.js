const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const mqttClient = require('../mqtt/client');
const GROUP = process.env.GROUP || 'grupoX';

/**
 * POST /api/configure
 * Salva a configuração e publica no tópico que o ESP escuta: grupoX/config
 */
router.post('/configure', async (req, res) => {
  const { name, espId, components } = req.body;

  if (!name || !espId || !Array.isArray(components)) {
    return res.status(400).json({ error: 'Dados inválidos na configuração.' });
  }

  try {
    // Salva ou atualiza o dispositivo no MongoDB
    const device = await Device.findOneAndUpdate(
      { espId },
      { name, components },
      { upsert: true, new: true }
    );

    // Mapeia modelos conhecidos para tipos esperados pelo ESP
    const tipoMapeado = (model) => {
      switch (model.toUpperCase()) {
        case 'KY-023': return 'joystick_ky023';
        case 'DHT11': return 'dht11';
        case 'MPU6050': return 'mpu6050';
        case 'DS18B20': return 'ds18b20';
        case 'HCSR04': return 'hcsr04';
        case 'IR_RECEIVER': return 'ir_receiver';
        case 'KEYPAD': return 'keypad';
        case 'APDS9960': return 'apds9960';
        case 'BOTAO': return 'botao';
        case 'ENCODER': return 'encoder';
        default: return model.toLowerCase(); // fallback genérico
      }
    };

    // Agrupa os pinos por tipo de sensor/atuador
    const grouped = {};
    components.forEach(c => {
      const tipo = tipoMapeado(c.model);
      if (tipo && typeof c.pin === 'number') {
        if (!grouped[tipo]) grouped[tipo] = [];
        grouped[tipo].push(c.pin);
      }
    });

    // Publica cada configuração no tópico genérico que o ESP escuta
    const topic = `${GROUP}/config`;

    Object.entries(grouped).forEach(([tipo, pinos]) => {
      pinos.forEach(pin => {
        const payload = {
          comando: 'ADD',
          tipo,
          pino: pin
        };
        mqttClient.publish(topic, JSON.stringify(payload));
        console.log(`Publicado para ${topic}:`, payload);
      });
    });

    res.json({ message: 'Configuração salva e enviada com sucesso', device });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

module.exports = router;
