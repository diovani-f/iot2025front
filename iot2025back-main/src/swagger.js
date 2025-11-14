const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IoT 2025 API',
      version: '1.0.0',
      description: 'Documentação da API para gerenciamento de placas ESP32 e seus sensores/atuadores'
    },
    tags: [
      {
        name: 'Dispositivos',
        description: 'Operações relacionadas às placas ESP32 e seus componentes'
      },
      {
        name: 'Regras',
        description: 'Motor de regras (condição -> ação em atuadores)'
      },
      {
        name: 'Laboratorio',
        description: 'Simulação de eventos do cenário (senha, porta, temperatura)'
      }
      ,
      {
        name: 'Leituras',
        description: 'Consulta e exportação de leituras de sensores'
      }
    ],
    components: {
      schemas: {
        Component: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome amigável do componente',
              example: 'Sensor de Temperatura'
            },
            model: {
              type: 'string',
              description: 'Modelo técnico do componente',
              example: 'DS18B20'
            },
            type: {
              type: 'string',
              enum: ['sensor', 'atuador'],
              description: 'Tipo do componente',
              example: 'sensor'
            },
            pin: {
              type: 'integer',
              description: 'Pino conectado no ESP32',
              example: 4
            },
            interval: {
              type: 'integer',
              description: 'Intervalo de leitura em milissegundos (apenas para sensores)',
              example: 10000
            },
            unit: {
              type: 'string',
              description: 'Unidade de medida',
              example: '°C'
            },
            label: {
              type: 'string',
              description: 'Nome para exibição',
              example: 'Temperatura ambiente'
            },
            config: {
              type: 'object',
              description: 'Configurações específicas do componente',
              example: {
                min: 0,
                max: 50
              }
            }
          }
        },
        Device: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome da placa ESP32',
              example: 'ESP32 Sala'
            },
            espId: {
              type: 'string',
              description: 'Identificador único da placa',
              example: 'esp32_sala_01'
            },
            components: {
              type: 'array',
              description: 'Lista de sensores e atuadores conectados à placa',
              items: {
                $ref: '#/components/schemas/Component'
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'] // Caminho para os arquivos com anotações Swagger
};

module.exports = swaggerJSDoc(options);
