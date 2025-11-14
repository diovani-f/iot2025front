const mongoose = require('mongoose');
const mqtt = require('mqtt');
const Reading = require('../models/Reading');
const Device = require('../models/Device');

// Conexão MQTT
const options = {
  host: 'wa2fc908.ala.us-east-1.emqxsl.com',
  port: 8883,
  protocol: 'mqtts',
  username: 'diovani',
  password: 'facco123'
};

const client = mqtt.connect(options);

// Função para mapear modelo para tipo esperado pelo ESP
const mapearTipo = (model) => {
  switch (model.toUpperCase()) {
    case 'KY-023': return 'joystick_ky023';
    case 'DHT11': return 'dht11';
    case 'MPU6050': return 'mpu6050';
    default: return model.toLowerCase();
  }
};

// Limpa tópicos retidos no broker
const limparTopicosRetidos = async () => {
  try {
    const devices = await Device.find();
    const topicos = [];

    devices.forEach(device => {
      device.components?.forEach(c => {
        if (typeof c.model === 'string' && typeof c.pin === 'number') {
          const tipo = mapearTipo(c.model);
          const base = `sw${c.pin}`;
          topicos.push(`grupoX/sensor/${tipo}/${base}/position`);
          topicos.push(`grupoX/sensor/${tipo}/${base}/switch`);
        }
      });
    });

    topicos.forEach(t => {
      client.publish(t, '', { retain: true });
      console.log(`🧹 Mensagem retida limpa em: ${t}`);
    });
  } catch (err) {
    console.error('Erro ao limpar tópicos retidos:', err);
  }
};

// Buffer de últimas leituras
const ultimoValor = {}; // { [espId]: { data, timestamp } }

const mudouSignificativamente = (a, b) => {
  if (a.x !== undefined && b.x !== undefined) {
    return Math.abs(a.x - b.x) > 10 || Math.abs(a.y - b.y) > 10;
  }
  return JSON.stringify(a) !== JSON.stringify(b);
};

const deveSalvar = (espId, novoValor) => {
  const anterior = ultimoValor[espId];
  const agora = Date.now();

  if (!anterior || agora - anterior.timestamp > 1000 || mudouSignificativamente(anterior.data, novoValor)) {
    ultimoValor[espId] = { data: novoValor, timestamp: agora };
    return true;
  }
  return false;
};

// Conectar e iniciar
client.on('connect', async () => {
  console.log('Conectado ao broker MQTT');
  await limparTopicosRetidos();

  client.subscribe('grupoX/config/response');
  client.subscribe('grupoX/sensor/#');
  client.subscribe('grupoX/atuador/botao');
});

// Processa mensagens MQTT
client.on('message', async (topic, message) => {
  const payload = message.toString();

  try {
    // Ignora confirmações de configuração
    if (topic === 'grupoX/config/response') {
      console.log('Confirmação de configuração recebida:', payload);
      return;
    }

    // Ignora botões específicos, ou pode implementar depois
    if (topic === 'grupoX/atuador/botao') return;

    const parts = topic.split('/');
    if (parts.length < 5) return;

    const tipo = parts[2];
    const base = parts[3];
    const subtipo = parts[4];

    const pino = base.replace(/\D/g, '');
    const pinNumber = Number(pino);
    if (isNaN(pinNumber)) return;

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      data = subtipo === 'switch'
        ? { estado: payload }
        : { valor: payload };
    }

    const espId = `${tipo}_${pinNumber}`;
    const podeSalvar = subtipo === 'switch' || deveSalvar(espId, data);
    if (!podeSalvar) return;

    // Salva leitura no MongoDB
    const reading = new Reading({
      espId,
      tipo,
      pino: pinNumber,
      data,
      timestamp: new Date()
    });

    await reading.save();
    console.log(`[${tipo}] Leitura salva (${subtipo}) no pino ${pinNumber}:`, data);

  } catch (err) {
    console.error('Erro ao processar mensagem MQTT:', err);
  }
});

client.on('error', (err) => {
  console.error('Erro MQTT:', err);
});

module.exports = client;