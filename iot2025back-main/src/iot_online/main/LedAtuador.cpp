#include "LedAtuador.h"
#include <Arduino.h>
#include <ArduinoJson.h> // Para a resposta JSON

// --- Construtor ---
LedAtuador::LedAtuador(int pin, String topic_base, PubSubClient* mqttClient) {
    _pin = pin;
    _client = mqttClient;
    // Tópico de controle, ex: grupoX/atuador/led/25
    _controlTopic = topic_base + "/" + String(pin);
}

// --- Setup ---
void LedAtuador::setup() {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, LOW); // Garante que comece desligado
    
    Serial.printf("[LED] Atuador inicializado no pino %d.\n", _pin);
    Serial.printf("[LED] Ouvindo no tópico: %s\n", _controlTopic.c_str());
}

// --- Loop (Vazio, é reativo) ---
void LedAtuador::loop() {}

// --- getType ---
String LedAtuador::getType() {
    return "led";
}

// --- Handle Message (Onde a mágica acontece) ---
void LedAtuador::handleMqttMessage(String topic, String payload) {
    if (topic != _controlTopic) return; // Ignora se não for para este LED

    Serial.printf("[LED] Pino %d - Comando recebido: %s\n", _pin, payload.c_str());

    String estadoReportado = "ERRO";

    if (payload == "ON") {
        digitalWrite(_pin, HIGH);
        estadoReportado = "LIGADO";
        
    } else if (payload == "OFF") {
        digitalWrite(_pin, LOW);
        estadoReportado = "DESLIGADO";

    } else {
        Serial.println("[LED] Comando desconhecido. Use 'ON' ou 'OFF'.");
        estadoReportado = "COMANDO_INVALIDO";
    }

    // Cria a resposta JSON
    DynamicJsonDocument doc(128);
    doc["status"] = "OK";
    doc["estado"] = estadoReportado;

    char jsonPayload[128];
    serializeJson(doc, jsonPayload, sizeof(jsonPayload));

    // Publica a resposta JSON no sub-tópico "/estado"
    String estadoTopic = _controlTopic + "/estado";
    if (_client->connected()) {
        _client->publish(estadoTopic.c_str(), jsonPayload);
    }
}