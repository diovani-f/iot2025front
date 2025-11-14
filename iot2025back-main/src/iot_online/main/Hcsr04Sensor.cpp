#include "Hcsr04Sensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONADO

const unsigned long MAX_ECHO_TIME_US = 30000;

// --- Implementação do Construtor ---
Hcsr04Sensor::Hcsr04Sensor(int trigPin, int echoPin, String topic_base, PubSubClient* mqttClient, unsigned long interval) {
    _trigPin = trigPin;
    _echoPin = echoPin;
    _client = mqttClient;
    _interval = interval;
    _lastReadTime = 0;
    _topic = topic_base + "/trig" + String(trigPin); 
}

// --- Implementação do Setup ---
void Hcsr04Sensor::setup() {
    pinMode(_trigPin, OUTPUT);
    pinMode(_echoPin, INPUT);
    digitalWrite(_trigPin, LOW);
    Serial.printf("[HC-SR04] Sensor inicializado. Trig: %d, Echo: %d. Publicando em %s\n", _trigPin, _echoPin, _topic.c_str());
}

// --- Implementação do Loop ---
void Hcsr04Sensor::loop() {
    if (millis() - _lastReadTime >= _interval) {
        _lastReadTime = millis();
        float distance = readDistance();

        // --- LÓGICA JSON ADICIONADA ---

        // 1. Prepara o documento JSON e o payload
        DynamicJsonDocument doc(128);
        char payload[128];

        if (distance > 0) {
            // Leitura válida
            Serial.printf("[HC-SR04] Trig %d - Distancia: %.2f cm\n", _trigPin, distance);
            doc["status"] = "OK";
            doc["distancia_cm"] = distance;
            
        } else {
            // Leitura inválida (fora de alcance / timeout)
            Serial.printf("[HC-SR04] Trig %d - Fora de alcance.\n", _trigPin);
            doc["status"] = "ERRO";
            doc["erro"] = "Fora de alcance";
        }

        // 2. Serializa o JSON
        serializeJson(doc, payload, sizeof(payload));

        // 3. Publica o JSON com verificação de segurança
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.println("[HC-SR04] Erro: MQTT desconectado. Mensagem não enviada.");
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

// --- Implementação do getType ---
String Hcsr04Sensor::getType() {
    return "hcsr04";
}

// --- Função Privada de Medição (sem alteração) ---
float Hcsr04Sensor::readDistance() {
    digitalWrite(_trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(_trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(_trigPin, LOW);

    long duration_us = pulseIn(_echoPin, HIGH, MAX_ECHO_TIME_US);

    if (duration_us == 0) {
        return 0.0;
    }

    float distance_cm = (duration_us * 0.0343) / 2.0;
    return distance_cm;
}