#include "KeypadSensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONADO

// --- Implementação do Construtor ---
KeypadSensor::KeypadSensor(byte* rowPins, byte* colPins, String topic_base, PubSubClient* mqttClient) {
    _rowPins = rowPins; 
    _colPins = colPins; 
    _client = mqttClient;
    _topic = topic_base + "/row" + String(rowPins[0]);
    _keypad = new Keypad(makeKeymap(_keys), _rowPins, _colPins, 4, 4);
}

// --- Implementação do Destrutor ---
KeypadSensor::~KeypadSensor() {
    delete _keypad;   
    delete[] _rowPins;
    delete[] _colPins;
}

// --- Implementação do Setup ---
void KeypadSensor::setup() {
    Serial.printf("[Keypad] Sensor inicializado. Publicando em %s\n", _topic.c_str());
}

// --- Implementação do Loop ---
void KeypadSensor::loop() {
    char key = _keypad->getKey();

    if (key) { // Se uma tecla foi pressionada
        Serial.printf("[Keypad] Tecla pressionada: %c\n", key);

        // --- LÓGICA JSON ADICIONADA ---
        
        // 1. Cria o documento JSON
        DynamicJsonDocument doc(64);
        doc["status"] = "OK";
        
        // Converte o 'char' para uma 'String' para o JSON
        char keyString[2] = {key, '\0'}; 
        doc["tecla"] = keyString;

        // 2. Serializa o JSON
        char payload[64];
        serializeJson(doc, payload, sizeof(payload));

        // 3. Publica o JSON com verificação de segurança
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.println("[Keypad] Erro: MQTT desconectado. Mensagem não enviada.");
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

// --- Implementação do getType ---
String KeypadSensor::getType() {
    return "keypad4x4";
}