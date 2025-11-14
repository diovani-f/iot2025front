#include "MotorVibracao.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONADO

// --- Implementação do Construtor ---
MotorVibracao::MotorVibracao(int pin, String topic_base, PubSubClient* mqttClient) {
    _pin = pin;
    _client = mqttClient;
    _controlTopic = topic_base + "/" + String(pin);
}

// --- Implementação do Setup ---
void MotorVibracao::setup() {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, LOW);
    Serial.printf("[MotorVibracao] Atuador inicializado no pino %d.\n", _pin);
    Serial.printf("[MotorVibracao] Ouvindo no tópico: %s\n", _controlTopic.c_str());
}

// --- Implementação do Loop ---
void MotorVibracao::loop() {
    // Reativo, sem código aqui.
}

// --- Implementação do getType ---
String MotorVibracao::getType() {
    return "motor_vibracao";
}

// --- Implementação do HandleMessage ---
void MotorVibracao::handleMqttMessage(String topic, String payload) {
    if (topic != _controlTopic) {
        return; // Ignora
    }

    Serial.printf("[MotorVibracao] Pino %d - Comando recebido: %s\n", _pin, payload.c_str());

    // --- LÓGICA DE RESPOSTA JSON ---
    String estadoReportado = "ERRO";

    if (payload == "ON") {
        digitalWrite(_pin, HIGH);
        estadoReportado = "LIGADO";
        
    } else if (payload == "OFF") {
        digitalWrite(_pin, LOW);
        estadoReportado = "DESLIGADO";

    } else {
        Serial.println("[MotorVibracao] Comando desconhecido. Use 'ON' ou 'OFF'.");
        estadoReportado = "COMANDO_INVALIDO";
    }

    // Cria o JSON de resposta
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
    // --- FIM DA ALTERAÇÃO ---
}