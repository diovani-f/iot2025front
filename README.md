Plataforma para Desenvolvimento de Aplicações IoT

Este repositório contém:
- iot2025back-main (Node.js + Mongo + MQTT)
- iot2025front-master (Vite/React)
- docker-compose.yml (MongoDB, Mosquitto, Backend, Frontend)

Requisitos
- Docker Desktop instalado (Windows)
- Alternativamente: Node.js 20+ e MongoDB instalados

Sensores/Atuadores Suportados (Anexo 2)
- DHT11 / DHT22 (temperatura/umidade)
- DS18B20 (temperatura)
- MPU6050 (acelerômetro/giroscópio)
- APDS9960 (gestos/cor/luz/proximidade)
- HCSR04 (distância)
- Encoder (estado porta)
- Keypad 4x4 (senha)
- Joystick KY023 (eixos X/Y)
- IR Receiver (códigos infravermelho)
- Relé, LEDs (cores), Motor de Vibração

Subir tudo com Docker (recomendado)

1) Opcional: copie `iot2025back-main/.env.example` para `iot2025back-main/.env` e ajuste as variáveis
2) No PowerShell, execute:

```
./scripts/up.ps1
```

3) Se desejar cadastrar os 4 dispositivos do cenário (ESP1–ESP4) no banco:

```
./scripts/seed.ps1
```

4) Acesse:
- API: http://localhost:3000/api-docs
- Frontend: http://localhost:5173

Controle de Atuadores (Frontend)

Na página Dispositivos, o botão "Controlar" abre um painel modal listando os componentes marcados como `type: 'actuator'` (ex.: LEDs, relé, motor de vibração). Cada atuador possui botões ON/OFF que enviam `POST /api/actuator { tipo, pin, command }` ao backend, o qual publica em `${GROUP}/atuador/<tipo>/<pin>`. Se o dispositivo não tiver atuadores cadastrados, o botão aparece desabilitado com a indicação "Sem Atuadores".

Para habilitar este controle certifique-se de cadastrar o dispositivo com componentes contendo `type: "actuator"` e `model` coerente (ex.: `led`, `rele`, `vibracao`).

Parar/remover tudo

```
./scripts/down.ps1
```

Tópicos MQTT (prefixo `${GROUP}`)

```
${GROUP}/sensor/<tipo>/sw<pino>/<subtipo>
${GROUP}/atuador/<tipo>/<pino>
```
Exemplos:
- Keypad: `${GROUP}/sensor/keypad/sw32/password` → `{ password }`
- Encoder: `${GROUP}/sensor/encoder/sw14/state` → `OPEN`/`CLOSED`
- DHT11: `${GROUP}/sensor/dht11/sw4/reading` → `{ temperature, humidity }`
- DS18B20: `${GROUP}/sensor/ds18b20/sw5/reading` → `{ temperature }`
- MPU6050: `${GROUP}/sensor/mpu6050/sw18/reading` → `{ ax, ay, az }` etc.
- HCSR04: `${GROUP}/sensor/hcsr04/sw23/reading` → `{ distance_cm }`
- APDS9960: `${GROUP}/sensor/apds9960/sw22/reading` → `{ lux, proximity, gesture }`
- Joystick: `${GROUP}/sensor/joystick/sw34/reading` → `{ x, y }`
- IR Receiver: `${GROUP}/sensor/ir_receiver/sw21/code` → `{ code }`
- Atuadores: `${GROUP}/atuador/<tipo>/<pino>` com carga `ON`/`OFF` (`led`, `rele`, `vibracao`)

Ambiente

- `GROUP` define o prefixo de tópicos (ex.: `grupo4`)
- Veja `iot2025back-main/.env.example` para mapear pinos e limites (temperatura, tempo de porta aberta, etc.)

Motor de Regras (Backend)
- Endpoints: `GET /api/rules`, `POST /api/rules`, `DELETE /api/rules/:id`.
- Condições: operadores `> >= < <= == != between` sobre valor extraído do payload.
- Ações: publicação em `${GROUP}/atuador/<tipo>/<pino>` com `ON`/`OFF` (opcional `durationMs`).

Simulação de Laboratório
- Rota: `POST /api/lab/trigger { event }`
- Eventos: `passwordOk`, `passwordFail`, `doorOpen`, `doorClose`, `tempHigh`, `tempNormal`.
- Facilita demonstração sem hardware completo.

Dispositivos (CRUD)
- `GET /api/devices` lista
- `POST /api/devices` cria/atualiza (upsert)
- `PUT /api/device/:espId` atualiza
- `DELETE /api/device/:espId` remove
- Alias: `POST /api/configure`

Swagger
- Documentação disponível em `/api-docs` com schemas de Device, Component e tags de Regras e Laboratório.
Streaming & Exportação
- Tempo real (SSE): `GET /api/stream/readings?espId=<opcional>` envia eventos `reading` conforme novas leituras chegam.
- Exportação CSV: `GET /api/readings/export/{espId}?limit=100` baixa arquivo com colunas dinâmicas dos dados.

Relatório Técnico
- Versão expandida em `docs/RELATORIO_TECNICO.md` (arquitetura, tópicos, sensores, regras, simulação, próximos passos).
Inclui seção de streaming e exportação de dados para integração com outras aplicações.
