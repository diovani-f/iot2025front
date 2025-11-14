const GROUP = process.env.GROUP || 'grupoX'

// Mapeamento padrão (pode ser sobrescrito via variáveis de ambiente)
const LAB = {
  ESP1_ID: process.env.LAB_ESP1_ID || 'esp1',
  ESP2_ID: process.env.LAB_ESP2_ID || 'esp2',
  ESP3_ID: process.env.LAB_ESP3_ID || 'esp3',
  ESP4_ID: process.env.LAB_ESP4_ID || 'esp4',
  // pinos de atuadores
  VIB_PIN: Number(process.env.LAB_VIB_PIN || 26),
  RELAY_PIN: Number(process.env.LAB_RELAY_PIN || 27),
  LED_GREEN_PIN: Number(process.env.LAB_LED_GREEN_PIN || 15),
  LED_YELLOW_PIN: Number(process.env.LAB_LED_YELLOW_PIN || 2),
  LED_RED_PIN: Number(process.env.LAB_LED_RED_PIN || 4),
  ENCODER_PIN: Number(process.env.LAB_ENCODER_PIN || 14),
  // regras
  PASSCODE: (process.env.LAB_PASSCODE || '1234').trim(),
  TEMP_LIMIT: Number(process.env.LAB_TEMP_LIMIT || 30),
  DOOR_OPEN_TIMEOUT_MS: Number(process.env.LAB_DOOR_OPEN_TIMEOUT_MS || 5000),
}

// Helpers para publicar comandos com duração
function publishWithDuration(mqttClient, tipo, pino, command, durationMs) {
  const topic = `${GROUP}/atuador/${tipo}/${pino}`
  mqttClient.publish(topic, command)
  if (durationMs && durationMs > 0 && command === 'ON') {
    setTimeout(() => mqttClient.publish(topic, 'OFF'), durationMs)
  }
}

module.exports = function attachLabAutomation(mqttClient) {
  const KEYPAD_TOPIC = `${GROUP}/sensor/keypad/#`
  const ENCODER_TOPIC = `${GROUP}/sensor/encoder/#`
  const DHT_TOPIC = `${GROUP}/sensor/dht11/#`

  mqttClient.subscribe(KEYPAD_TOPIC)
  mqttClient.subscribe(ENCODER_TOPIC)
  mqttClient.subscribe(DHT_TOPIC)

  // Estado simples
  let doorOpenSince = 0

  mqttClient.on('message', (topic, msg) => {
    if (topic.startsWith(`${GROUP}/sensor/keypad/`)) {
      // Espera tópico .../password com payload string ou { password }
      const txt = msg.toString()
      let pwd = ''
      try {
        const j = JSON.parse(txt)
        pwd = String(j.password || j.value || '').trim()
      } catch {
        pwd = txt.replace(/[^\x20-\x7E]/g, '').trim()
      }
      if (!pwd) return

      if (pwd === LAB.PASSCODE) {
        // Autorizado
        publishWithDuration(mqttClient, 'vibracao', LAB.VIB_PIN, 'ON', 1000)
        publishWithDuration(mqttClient, 'led', LAB.LED_GREEN_PIN, 'ON', 3000)
        // desbloqueio da porta
        publishWithDuration(mqttClient, 'rele', LAB.RELAY_PIN, 'ON', 1500)
      } else {
        // Negado
        publishWithDuration(mqttClient, 'vibracao', LAB.VIB_PIN, 'ON', 3000)
        publishWithDuration(mqttClient, 'led', LAB.LED_RED_PIN, 'ON', 3000)
      }
      return
    }

    if (topic.startsWith(`${GROUP}/sensor/encoder/`)) {
      // Espera payload { open: boolean } ou 'OPEN'/'CLOSED'
      const txt = msg.toString().trim()
      let isOpen = false
      try {
        const j = JSON.parse(txt)
        isOpen = !!(j.open ?? j.isOpen)
      } catch {
        isOpen = /open/i.test(txt)
      }

      const now = Date.now()
      if (isOpen) {
        if (!doorOpenSince) doorOpenSince = now
        // Se aberta por mais de X ms, alerta (verde+vermelho)
        if (now - doorOpenSince > LAB.DOOR_OPEN_TIMEOUT_MS) {
          mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_GREEN_PIN}`, 'ON')
          mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_RED_PIN}`, 'ON')
        }
      } else {
        doorOpenSince = 0
        // apaga leds verde/vermelho
        mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_GREEN_PIN}`, 'OFF')
        mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_RED_PIN}`, 'OFF')
      }
      return
    }

    if (topic.startsWith(`${GROUP}/sensor/dht11/`)) {
      // Espera payload { temperature: number } ou similar
      const txt = msg.toString()
      let temp = NaN
      try {
        const j = JSON.parse(txt)
        temp = parseFloat(j.temperature ?? j.temperatura_c ?? j.temp)
      } catch {
        const v = parseFloat(txt)
        if (Number.isFinite(v)) temp = v
      }
      if (!Number.isFinite(temp)) return
      if (temp > LAB.TEMP_LIMIT) {
        mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_YELLOW_PIN}`, 'ON')
      } else {
        mqttClient.publish(`${GROUP}/atuador/led/${LAB.LED_YELLOW_PIN}`, 'OFF')
      }
    }
  })
}
