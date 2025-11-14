const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
  name: String,
  model: String,
  type: String,
  pin: Number,
  interval: Number,
  unit: String,
  label: String,
  config: Object
});

const deviceSchema = new mongoose.Schema({
  name: String,
  espId: String,
  components: [componentSchema]
});

module.exports = mongoose.model('Device', deviceSchema);