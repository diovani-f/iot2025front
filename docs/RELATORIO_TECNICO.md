# Relatório Técnico — Plataforma IoT 2025

## 1. Visão Geral da Arquitetura
- ESP32 (firmwares em `firmware/`) publicam e consomem tópicos MQTT (broker interno Mosquitto ou externo EMQX) usando prefixo configurável `GROUP`.
- Backend Node.js / Express: cliente MQTT assina tópicos `${GROUP}/sensor/#` e `${GROUP}/atuador/#`, persiste leituras em MongoDB (coleção `readings`), mantém cadastro de dispositivos (coleção `devices`), aplica motor de regras (coleção `rules`) e expõe REST + Swagger.
- Frontend React/Vite (dashboard): visualização de dispositivos, leituras, criação de automações locais (client-side) e criação/listagem/remoção de regras persistentes de backend.
- Scripts PowerShell para subir/derrubar stack Docker e semear dispositivos de laboratório.

## 2. Tecnologias e Justificativas
- MQTT: padrão leve, suporte QoS, retenção e escalabilidade para milhares de sensores.
- MongoDB: esquema flexível para payloads heterogêneos (diferentes sensores) e evolução sem migrações complexas.
- Node.js: facilidade de integração com `mqtt`, `mongoose` e processamento assíncrono de fluxos de dados.
- React + Vite + Tailwind: desenvolvimento rápido, hot reload, UX responsiva e componenteização clara.
- Docker Compose: provisiona infraestrutura completa (Mongo, Mosquitto, Backend, Frontend) de forma reprodutível.

## 3. Modelagem de Dados
- Device: `{ name, espId, components[] }` onde cada componente contém metadados (pin, model, type, interval, limites etc.).
- Reading: `{ espId, tipo, pino, data, timestamp }` – documento leve por evento significativo (filtro de mudanças no backend).
- Rule: `{ name, deviceId, sensor{tipo,pino,field}, condition{operator,value,value2}, action{tipo,pino,command,durationMs} }` – condição numérica ou intervalo aciona publicação MQTT.

## 4. Sensores e Atuadores Suportados
Sensores (entrada): DHT11/DHT22, DS18B20, MPU6050, APDS9960 (luz/gestos), HCSR04 (distância), Encoder (porta), Keypad 4x4 (senha), Joystick KY-023 (eixos), IR Receiver (códigos infravermelho).
Atuadores (saída): Relé, LEDs (cores), Motor de Vibração.
Firmwares de exemplo criados ou stubs presentes para cada tipo em `firmware/` (ex.: `stub_ds18b20`, `stub_mpu6050` etc.).

## 5. Padrão de Tópicos MQTT (prefixo `${GROUP}`)
```
${GROUP}/sensor/<tipo>/sw<pino>/<subtipo>
${GROUP}/atuador/<tipo>/<pino>
```
Exemplos:
- DHT11: `${GROUP}/sensor/dht11/sw4/reading` → `{ temperature, humidity }`
- DS18B20: `${GROUP}/sensor/ds18b20/sw5/reading` → `{ temperature }`
- MPU6050: `${GROUP}/sensor/mpu6050/sw18/reading` → `{ ax, ay, az, gx, gy, gz }`
- HCSR04: `${GROUP}/sensor/hcsr04/sw23/reading` → `{ distance_cm }`
- APDS9960: `${GROUP}/sensor/apds9960/sw22/reading` → `{ lux, proximity, gesture }`
- Joystick: `${GROUP}/sensor/joystick/sw34/reading` → `{ x, y }`
- Encoder: `${GROUP}/sensor/encoder/sw14/state` → `OPEN` | `CLOSED`
- Keypad: `${GROUP}/sensor/keypad/sw32/password` → `{ password }`
- IR Receiver: `${GROUP}/sensor/ir_receiver/sw21/code` → `{ code }`
- Atuadores: `${GROUP}/atuador/led/15` ou `${GROUP}/atuador/rele/27` com carga `ON` / `OFF`.

## 6. Motor de Regras (Backend)
1. Mensagem MQTT recebida → parse JSON ou valor numérico simples.
2. Identificação `espId` derivada de `<tipo>_<pino>`.
3. Persistência condicionada (mudança significativa ou subtipo `switch`).
4. Busca de regras: filtro `{ deviceId, sensor.tipo, sensor.pino }`.
5. Extração numérica (função `extractValue`): normaliza chaves diferentes para um valor comparável (ex.: `temperature`, `ax`, `distance_cm`).
6. Avaliação com operadores: `> >= < <= == != between`.
7. Acionamento: publica em `${GROUP}/atuador/<tipo>/<pino>` e em tópico de compatibilidade legado (`sensor/<tipo>/sw<pino>/switch`).

## 7. Automação Local (Frontend)
Automação cliente permite regras de alerta e agendamento sem persistência no backend (útil para demonstração rápida). Backend mantém regras definitivas e centralizadas.

## 8. Rota de Simulação de Laboratório
`POST /api/lab/trigger { event }` onde `event ∈ passwordOk | passwordFail | doorOpen | doorClose | tempHigh | tempNormal`.
Aciona publicações MQTT para validar fluxo de senha, porta e temperatura sem hardware físico.

## 9. Endpoints Principais
- `GET /api/devices` / `POST /api/devices` / `PUT /api/device/:espId` / `DELETE /api/device/:espId` / `POST /api/configure`.
- `GET /api/readings/:espId` (histórico recente por dispositivo).
- `GET /api/rules` / `POST /api/rules` / `DELETE /api/rules/:id`.
- `POST /api/lab/trigger` (simulação).
- `POST /api/actuator` publica comandos imediatos (ON/OFF) em `${GROUP}/atuador/<tipo>/<pino>`.
- Swagger: `/api-docs`.
 - Streaming SSE: `GET /api/stream/readings?espId=<opcional>`.
 - Export CSV: `GET /api/readings/export/{espId}?limit=100`.

## 10. Deploy e Execução
Docker: `./scripts/up.ps1` → sobe stack; `./scripts/seed.ps1` → semeia dispositivos; `./scripts/down.ps1` → derruba.
Sem Docker: configurar `.env`, iniciar Mongo/MQTT externos, `npm ci && npm run dev` no backend e `npm run dev` no frontend.

## 11. Segurança e Configuração
Variáveis sensíveis (usuário/senha do broker externo) em `.env` (exemplo em `.env.example`). Sem credenciais hardcoded em rotas.

## 12. Testes e Validação
- Ferramenta MQTTX para publicar leituras simuladas.
- Rota de simulação acelera verificação de fluxo da automação do trabalho.
- Verificação manual do acionamento de atuadores via logs do backend.
 - Streaming SSE testado consumindo `curl http://localhost:3000/api/stream/readings` e observando eventos.
 - Export CSV verificado com `curl -O http://localhost:3000/api/readings/export/dht11_4`.

## 13. Limitações e Próximos Passos
- Não há streaming em tempo real (polling). Próximo passo: WebSocket / SSE.
- Sem autenticação de usuários ou RBAC para regras.
- Métrica de health do broker e fila de mensagens não exibida.
- Persistência de eventos de trigger pode ser expandida para auditoria.
 - (Atualizado) SSE básico implementado; evolução futura: canais WebSocket com autenticação e filtros avançados.

## 14. Conclusão
Plataforma cumpre requisitos: integração multi-sensor, armazenamento, processamento (regras), visualização (dashboard), automação de cenário e documentação. Controle manual de atuadores disponível no frontend (modal de dispositivo). Extensível para novos sensores com ajustes mínimos na função de extração.
