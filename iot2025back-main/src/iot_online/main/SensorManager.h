#pragma once
#include <PubSubClient.h>
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONE ESTA LINHA

// Inicializa o gerenciador
void sensorManagerSetup(PubSubClient* client);

// --- ALTERAÇÃO AQUI ---
// Função "Factory" que cria e adiciona um sensor a partir da sua configuração JSON
void addSensor(JsonObject config);
// --- FIM DA ALTERAÇÃO ---

// Loop principal que itera por todos os sensores
void sensorManagerLoop();

void sensorManagerHandleMessage(String topic, String payload);