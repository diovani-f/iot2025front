const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  deviceId: { type: String, required: true },
  sensor: {
    tipo: { type: String, required: true },
    pino: { type: Number, required: true },
    field: { type: String } // opcional: campo do payload a observar
  },
  condition: {
    operator: { type: String, enum: ['>=', '<=', '==', '!=', '>', '<', 'between'], required: true },
    value: { type: Number, required: true },
    value2: { type: Number } // opcional para between
  },
  action: {
    tipo: { type: String, required: true }, // ex: led, rele, vibracao
    pino: { type: Number, required: true },
    command: { type: String, enum: ['ON', 'OFF'], required: true },
    durationMs: { type: Number } // opcional: liga por X ms
  }
}, { timestamps: true });

module.exports = mongoose.model('Rule', RuleSchema);
