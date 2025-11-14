#include "Ds18b20Sensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- ADICIONADO

// --- Implementação do Construtor ---
Ds18b20Sensor::Ds18b20Sensor(int pin, String topic_base, PubSubClient* mqttClient, unsigned long interval) {
    _pin = pin;
    _client = mqttClient;
    _interval = interval;
    _lastReadTime = 0;
    _topic = topic_base + "/" + String(pin);
    _oneWireBus = new OneWire(_pin);
    _dallasSensors = new DallasTemperature(_oneWireBus);
}

// --- Implementação do Destrutor ---
Ds18b20Sensor::~Ds18b20Sensor() {
    delete _dallasSensors;
    delete _oneWireBus;
}

// --- Implementação do Setup ---
void Ds18b20Sensor::setup() {
    _dallasSensors->begin();
    Serial.printf("[DS18B20] Sensor inicializado no pino %d (1-Wire). Publicando em %s\n", _pin, _topic.c_str());
}

// --- Implementação do Loop ---
void Ds18b20Sensor::loop() {
    if (millis() - _lastReadTime >= _interval) {
        _lastReadTime = millis();
        _dallasSensors->requestTemperatures(); 
        float tempC = _dallasSensors->getTempCByIndex(0);

        // --- LÓGICA DE PUBLICAÇÃO ALTERADA ---

        // Prepara o documento JSON
        DynamicJsonDocument doc(128);
        char payload[128];

        if (tempC == DEVICE_DISCONNECTED_C) {
            // Caso de Erro
            Serial.printf("[DS18B20] Erro: Sensor no pino %d desconectado.\n", _pin);
            doc["status"] = "ERRO";
            doc["erro"] = "Sensor desconectado";
            
        } else {
            // Caso de Sucesso
            Serial.printf("[DS18B20] Pino %d - Temperatura: %.2f C\n", _pin, tempC);
            doc["status"] = "OK";
            doc["temperatura_c"] = tempC;
        }

        // Serializa o JSON para a string 'payload'
        serializeJson(doc, payload, sizeof(payload));

        // Publica o JSON com a verificação de segurança
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.printf("[DS18B20] Erro: MQTT desconectado. Falha ao publicar JSON.\n");
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

// --- Implementação do getType ---
String Ds18b20Sensor::getType() {
    return "ds18b20";
}