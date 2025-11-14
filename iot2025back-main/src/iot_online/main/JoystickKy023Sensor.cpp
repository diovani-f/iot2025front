#include "JoystickKy023Sensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> 

// --- Implementação do Construtor ---
JoystickKy023Sensor::JoystickKy023Sensor(byte* pins, String topic_base, PubSubClient* mqttClient, unsigned long interval) {
    _pins = pins;
    _client = mqttClient;
    _interval = interval;
    _lastReadTime = 0;
    _baseTopic = topic_base + "/sw" + String(_pins[2]);
}

// --- Implementação do Destrutor ---
JoystickKy023Sensor::~JoystickKy023Sensor() {
    delete[] _pins; 
}

// --- Implementação do Setup ---
void JoystickKy023Sensor::setup() {
    pinMode(_pins[0], INPUT); // X_PIN
    pinMode(_pins[1], INPUT); // Y_PIN
    pinMode(_pins[2], INPUT_PULLUP); // SW_PIN
    _lastSwState = digitalRead(_pins[2]);
    Serial.printf("[Joystick] Sensor inicializado. X:%d, Y:%d, SW:%d. Publicando em %s/...\n", _pins[0], _pins[1], _pins[2], _baseTopic.c_str());
}

// --- Implementação do Loop ---
void JoystickKy023Sensor::loop() {
    
    // --- 1. Checagem do Botão (Event-driven) ---
    int swState = digitalRead(_pins[2]);
    if (_lastSwState == HIGH && swState == LOW) {
        Serial.printf("[Joystick] SW %d - Pressionado!\n", _pins[2]);
        String swTopic = _baseTopic + "/switch";
        
        // --- ALTERADO PARA JSON ---
        DynamicJsonDocument doc(64);
        doc["status"] = "OK";
        doc["evento"] = "pressionado";
        char payload[64];
        serializeJson(doc, payload, sizeof(payload));

        if (_client->connected()) {
            _client->publish(swTopic.c_str(), payload); // Envia o JSON
        }
        // --- FIM DA ALTERAÇÃO ---
        
        delay(50); // Debounce
    }
    _lastSwState = swState;

    // --- 2. Checagem dos Eixos X/Y (Time-driven) ---
    if (millis() - _lastReadTime >= _interval) {
        _lastReadTime = millis();

        int xVal = analogRead(_pins[0]);
        int yVal = analogRead(_pins[1]);

        // --- JSON ATUALIZADO ---
        DynamicJsonDocument doc(128);
        doc["status"] = "OK"; // <--- ADICIONADO
        doc["x"] = xVal;
        doc["y"] = yVal;
        // --- FIM DA ATUALIZAÇÃO ---

        char payload[128];
        serializeJson(doc, payload, sizeof(payload));

        Serial.printf("[Joystick] Pinos %d,%d - Publicando: %s\n", _pins[0], _pins[1], payload);
        String posTopic = _baseTopic + "/position";
        if (_client->connected()) {
            _client->publish(posTopic.c_str(), payload);
        }
    }
}

// --- Implementação do getType ---
String JoystickKy023Sensor::getType() {
    return "joystick_ky023";
}