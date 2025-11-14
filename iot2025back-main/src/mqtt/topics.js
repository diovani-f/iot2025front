module.exports = {
  configTopic: (espId) => `esp32/${espId}/config`,
  dataTopic: (espId) => `esp32/${espId}/data`
};
