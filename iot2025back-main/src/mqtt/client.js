const mqtt = require('mqtt');
const Reading = require('../models/Reading');
const Device = require('../models/Device');
const Rule = require('../models/Rule');
const { readingEmitter } = require('../events');
const GROUP = process.env.GROUP || 'grupoX';
const MQTT_HOST = process.env.MQTT_HOST || 'mosquitto';
const MQTT_PORT = Number(process.env.MQTT_PORT) || 1883;
const MQTT_PROTOCOL = process.env.MQTT_PROTOCOL || 'mqtt';
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const options = {
  host: MQTT_HOST,
  port: MQTT_PORT,
  protocol: MQTT_PROTOCOL,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD
};

const client = mqtt.connect(options);

// Mapeia modelo para tipo
const mapearTipo = (model) => {
  switch (model.toUpperCase()) {
    case 'KY-023': return 'joystick';
    case 'DHT11': return 'dht11';
    case 'MPU6050': return 'mpu6050';
    case 'DS18B20': return 'ds18b20';
    default: return model.toLowerCase();
  }
};

// Limpa tópicos retidos
const limparTopicosRetidos = async () => {
  try {
    const devices = await Device.find();
    const topicos = [];

    devices.forEach(device => {
      device.components?.forEach(c => {
        if (typeof c.model === 'string' && typeof c.pin === 'number') {
          const tipo = mapearTipo(c.model);
          const base = `sw${c.pin}`;
          topicos.push(`${GROUP}/sensor/${tipo}/${base}/position`);
          topicos.push(`${GROUP}/sensor/${tipo}/${base}/switch`);
        }
      });
    });

    topicos.forEach(t => {
      client.publish(t, '', { retain: true });
      console.log(`Mensagem retida limpa em: ${t}`);
    });
  } catch (err) {
    console.error('Erro ao limpar tópicos retidos:', err);
  }
};

client.on('connect', async () => {
  console.log('Conectado ao broker MQTT');
  await limparTopicosRetidos();

  client.subscribe(`${GROUP}/config/response`);
  client.subscribe(`${GROUP}/sensor/#`);
  client.subscribe(`${GROUP}/atuador/botao`);
});

// Buffer de últimas leituras
const ultimoValor = {};
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

// --- Motor de Regras ---
// Extrai um valor numérico de um payload heterogêneo para avaliação de regras
const extractValue = (tipo, data, field = 'valor') => {
  if (!data) return NaN;
  // Campo explícito solicitado pela regra
  if (field && data[field] !== undefined) {
    const v = data[field];
    const num = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(num) ? num : NaN;
  }
  // Normalizações comuns
  if (typeof data === 'number') return data;
  if (data.valor !== undefined) {
    const v = typeof data.valor === 'number' ? data.valor : parseFloat(data.valor);
    if (Number.isFinite(v)) return v;
  }
  // Mapeamentos específicos por tipo de sensor
  switch (tipo) {
    case 'ds18b20':
      return pickNumber(data, ['temperatura_c', 'temperature', 'temp']);
    case 'dht11':
    case 'dht22':
      return pickNumber(data, ['temperatura_c', 'temperature', 'temp']);
    case 'mpu6050':
      // prioriza eixo X só como exemplo
      return pickNumber(data, ['ax', 'x', 'accel_x']);
    case 'hcsr04':
      return pickNumber(data, ['distance_cm', 'distance', 'dist']);
    case 'apds9960':
      // pode ter luz/gesto - escolhe proximidade/lux
      return pickNumber(data, ['lux', 'light', 'proximity']);
    case 'joystick':
    case 'joystick_ky023':
      return pickNumber(data, ['x', 'xAxis', 'valor']);
    case 'encoder':
      return data.open === true || /open/i.test(String(data.estado || '')) ? 1 : 0;
    case 'keypad':
      return data.password ? data.password.length : NaN;
    case 'ir_receiver':
      return pickNumber(data, ['code', 'valor']);
    default:
      return NaN;
  }
};

// Helper para tentar múltiplas chaves numéricas
const pickNumber = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined) {
      const v = typeof obj[k] === 'number' ? obj[k] : parseFloat(obj[k]);
      if (Number.isFinite(v)) return v;
    }
  }
  return NaN;
};


const checkCondition = (op, v, a, b) => {
  switch (op) {
    case '>=': return v >= a;
    case '<=': return v <= a;
    case '==': return v == a;
    case '!=': return v != a;
    case '>':  return v > a;
    case '<':  return v < a;
    case 'between': return v >= a && v <= (b ?? a);
    default: return false;
  }
};

const publishAction = (action) => {
  const topic = `${GROUP}/atuador/${action.tipo}/${action.pino}`;
  client.publish(topic, action.command);
  console.log(`🚀 Regra acionada → ${topic}: ${action.command}`);

  const legacyTopic = `${GROUP}/sensor/${action.tipo}/sw${action.pino}/switch`;
  client.publish(legacyTopic, action.command);
  console.log(`🚀 Regra acionada (compatibilidade) → ${legacyTopic}: ${action.command}`);
};

// --- Processa mensagens MQTT ---
client.on('message', async (topic, message) => {
  const payload = message.toString();
  console.log("📩 Mensagem recebida:", { topic, payload });

  if (topic === `${GROUP}/config/response`) {
    console.log('Confirmação de configuração recebida:', payload);
    return;
  }

  const parts = topic.split('/');
  if (parts.length < 4) {
    console.log("⚠️ Tópico ignorado, partes insuficientes:", parts);
    return;
  }

  const tipo = parts[2];
  const base = parts[3];
  const subtipo = parts[4] || 'default';

  const pino = Number(base.replace(/\D/g, ''));
  if (isNaN(pino)) {
    console.log("⚠️ Pino inválido extraído de base:", base);
    return;
  }

  let data;
  try {
    data = JSON.parse(payload);
    console.log("✅ Payload é JSON válido:", data);
  } catch {
    data = { valor: parseFloat(payload) };
    console.log("⚠️ Payload não era JSON, convertido para:", data);
  }

  console.log("📊 Dados interpretados:", data);

  const espId = `${tipo}_${pino}`;
  console.log("🔑 Identificador calculado:", espId);

  const podeSalvar = subtipo === 'switch' || deveSalvar(espId, data);
  console.log("💾 Deve salvar?", podeSalvar, "Subtipo:", subtipo);

  if (!podeSalvar) return;

  try {
    const reading = new Reading({ espId, tipo, pino, data, timestamp: new Date() });
    await reading.save();
    console.log(`[${tipo}] ✅ Leitura salva no pino ${pino}:`, data);
    // Emite evento SSE
    readingEmitter.emit('reading', {
      espId,
      tipo,
      pino,
      timestamp: reading.timestamp,
      data
    });
  } catch (err) {
    console.error(`❌ Erro ao salvar leitura de ${tipo} no pino ${pino}:`, err);
  }

  try {
    console.log("🔍 Buscando regras com filtro:", { deviceId: espId, "sensor.tipo": tipo, "sensor.pino": pino });
    const rules = await Rule.find({ deviceId: espId, "sensor.tipo": tipo, "sensor.pino": pino });
    console.log("📋 Regras encontradas:", rules.length);

    for (const rule of rules) {
      console.log("➡️ Avaliando regra:", rule.name);
      const valor = extractValue(tipo, data, rule.sensor.field || 'valor');
      console.log("📐 Valor extraído:", valor);

      if (Number.isNaN(valor)) {
        console.log("⚠️ Valor inválido (NaN), regra ignorada");
        continue;
      }

      const met = checkCondition(rule.condition.operator, valor, rule.condition.value, rule.condition.value2);
      console.log(`📏 Condição ${rule.condition.operator} ${rule.condition.value} →`, met);

      if (met) {
        console.log("✅ Condição satisfeita, publicando ação:", rule.action);
        publishAction(rule.action);
      } else {
        console.log("❌ Condição não satisfeita");
      }
    }
  } catch (err) {
    console.error("❌ Erro ao avaliar regras:", err);
  }
});

client.on('error', (err) => {
  console.error('❌ Erro MQTT:', err);
});

module.exports = client;
