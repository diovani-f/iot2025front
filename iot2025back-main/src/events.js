const EventEmitter = require('events');

// Emissor global para eventos de leitura
class ReadingEmitter extends EventEmitter {}

module.exports = {
  readingEmitter: new ReadingEmitter()
};
