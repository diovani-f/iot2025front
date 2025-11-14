IoT 2025 Backend

- API Docs Swagger: `/api-docs`

Como rodar localmente (sem Docker)

1) Copie `.env.example` para `.env` e ajuste variáveis (Mongo e MQTT)
2) Instale deps e rode

```
npm ci
npm run dev
```

Endpoints principais

- `GET /api/devices` — lista dispositivos cadastrados
- `POST /api/devices` — cria/atualiza dispositivo
- `GET /api/readings/:espId` — lista leituras de um device
- `GET /api/readings/:espId/latest` — última leitura
- `POST /api/actuator` — publica comando `{ tipo, pin, command }`
- `POST /api/rules` — cria regra
- `GET /api/rules` — lista regras

Automação do Laboratório (ESP1–ESP4)

- Quando um payload de `keypad` publicar a senha correta, o backend:
	- Vibra motor (1s), acende LED verde (3s) e aciona relé da porta
- Senha incorreta: vibra 3s e acende LED vermelho 3s
- Encoder: se porta aberta > 5s, acende verde+vermelho; ao fechar, apaga ambos
- DHT11: se temperatura > limite (`LAB_TEMP_LIMIT`), acende LED amarelo; caso contrário, apaga

Tópicos esperados

- Keypad: `${GROUP}/sensor/keypad/swXX/password` → payload string ou `{ password: "1234" }`
- Encoder: `${GROUP}/sensor/encoder/swXX/state` → `{ open: true|false }` ou `OPEN`/`CLOSED`
- DHT11: `${GROUP}/sensor/dht11/swXX/reading` → `{ temperature: 25.0, humidity: 60 }`

Atuadores

- `${GROUP}/atuador/vibracao/<pino>` — `ON`/`OFF`
- `${GROUP}/atuador/rele/<pino>` — `ON`/`OFF`
- `${GROUP}/atuador/led/<pino>` — `ON`/`OFF`

Variáveis de ambiente para o cenário (`.env`)

Veja `.env.example` para mapeamento de pinos e IDs dos 4 ESPs.
