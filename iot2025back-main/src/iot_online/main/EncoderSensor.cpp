#include "EncoderSensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONADO

// --- Implementação do Construtor ---
EncoderSensor::EncoderSensor(int pin, String topic_base, PubSubClient* mqttClient, unsigned long interval) {
    _pin = pin;
    _client = mqttClient;
    _topic = topic_base + "/" + String(pin);
    _interval = interval;
    _pulseCount = 0;
    _lastCalcTime = 0;
}

// --- Implementação do Setup ---
void EncoderSensor::setup() {
    pinMode(_pin, INPUT_PULLUP); 
    attachInterruptArg(digitalPinToInterrupt(_pin), isr_wrapper, this, RISING);
    Serial.printf("[Encoder] Sensor inicializado no pino %d. Publicando em %s\n", _pin, _topic.c_str());
}

// --- Implementação do Loop ---
void EncoderSensor::loop() {
    if (millis() - _lastCalcTime >= _interval) {
        _lastCalcTime = millis();
        unsigned long pulseCountCopy;

        // --- Seção Crítica ---
        noInterrupts();
        pulseCountCopy = _pulseCount;
        _pulseCount = 0;
        interrupts();
        // --- Fim da Seção Crítica ---

        float pps = (float)pulseCountCopy / (_interval / 1000.0);

        Serial.printf("[Encoder] Pino %d - Pulsos: %lu, PPS: %.2f\n", _pin, pulseCountCopy, pps);

        // --- LÓGICA JSON ADICIONADA ---

        // 1. Cria o documento JSON
        DynamicJsonDocument doc(128);
        doc["status"] = "OK";
        doc["pps"] = pps; // pps = Pulsos Por Segundo

        // 2. Serializa o JSON
        char payload[128];
        serializeJson(doc, payload, sizeof(payload));

        // 3. Publica o JSON com verificação de segurança
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.println("[Encoder] Erro: MQTT desconectado. Mensagem não enviada.");
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

// --- Implementação do getType ---
String EncoderSensor::getType() {
    return "encoder";
}

// --- Implementação das Funções de Interrupção ---
void IRAM_ATTR EncoderSensor::isr_wrapper(void* arg) {
    EncoderSensor* instance = static_cast<EncoderSensor*>(arg);
    instance->handleInterrupt();
}

void EncoderSensor::handleInterrupt() {
    _pulseCount++;
}