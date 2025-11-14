require('dotenv').config()
const mongoose = require('mongoose')
const Device = require('../src/models/Device')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iot2025'

async function run() {
  await mongoose.connect(MONGO_URI)
  console.log('mongo conectado')

  const group = process.env.GROUP || 'grupo4'
  const esp1 = process.env.LAB_ESP1_ID || 'esp1'
  const esp2 = process.env.LAB_ESP2_ID || 'esp2'
  const esp3 = process.env.LAB_ESP3_ID || 'esp3'
  const esp4 = process.env.LAB_ESP4_ID || 'esp4'

  // cadastro mínimo para UI
  const docs = [
    {
      name: 'ESP1 Keypad + Vibração',
      espId: esp1,
      components: [
        { name: 'Teclado 4x4', model: 'KEYPAD', type: 'sensor', pin: 33, label: 'keypad' },
        { name: 'Motor Vibração', model: 'VIB', type: 'atuador', pin: Number(process.env.LAB_VIB_PIN || 26), label: 'vibracao' }
      ]
    },
    {
      name: 'ESP2 Trava + Encoder',
      espId: esp2,
      components: [
        { name: 'Relé Porta', model: 'RELE', type: 'atuador', pin: Number(process.env.LAB_RELAY_PIN || 27), label: 'rele_porta' },
        { name: 'Encoder Porta', model: 'ENCODER', type: 'sensor', pin: Number(process.env.LAB_ENCODER_PIN || 14), label: 'porta_encoder' }
      ]
    },
    {
      name: 'ESP3 DHT11',
      espId: esp3,
      components: [
        { name: 'DHT11', model: 'DHT11', type: 'sensor', pin: 4, interval: 1000, label: 'dht11', unit: '°C', config: { max: Number(process.env.LAB_TEMP_LIMIT || 30) } }
      ]
    },
    {
      name: 'ESP4 LEDs',
      espId: esp4,
      components: [
        { name: 'LED Verde', model: 'LED', type: 'atuador', pin: Number(process.env.LAB_LED_GREEN_PIN || 15), label: 'led_verde' },
        { name: 'LED Amarelo', model: 'LED', type: 'atuador', pin: Number(process.env.LAB_LED_YELLOW_PIN || 2), label: 'led_amarelo' },
        { name: 'LED Vermelho', model: 'LED', type: 'atuador', pin: Number(process.env.LAB_LED_RED_PIN || 4), label: 'led_vermelho' }
      ]
    }
  ]

  for (const d of docs) {
    await Device.findOneAndUpdate({ espId: d.espId }, d, { upsert: true, new: true })
    console.log('device salvo:', d.espId)
  }

  await mongoose.disconnect()
  console.log('ok')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
