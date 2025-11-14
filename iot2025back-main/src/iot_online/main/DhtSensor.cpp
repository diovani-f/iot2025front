#include "DhtSensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // Para criar o JSON de resposta

// --- Implementação do Construtor ---
DhtSensor::DhtSensor(int pin, uint8_t dht_type, String typeString, String topic_base, PubSubClient* mqttClient, unsigned long interval) {
    _pin = pin;
    _dht_type = dht_type;
    _typeString = typeString;
    _client = mqttClient;
    _interval = interval;
    _lastReadTime = 0 - interval; 
    _topic = topic_base + "/" + String(pin); // --- TÓPICO CORRIGIDO (padrão antigo) ---
    _dht = new DHT(_pin, _dht_type);
}

// --- Implementação do Destrutor ---
DhtSensor::~DhtSensor() {
    delete _dht;
}

// --- Implementação do Setup ---
void DhtSensor::setup() {
    _dht->begin();
    Serial.printf("[DHT] Sensor %s inicializado no pino %d. Publicando em %s\n", _typeString.c_str(), _pin, _topic.c_str());
}

// --- Implementação do Loop ---
void DhtSensor::loop() {
    if (millis() - _lastReadTime >= _interval) {
        _lastReadTime = millis();

        float h = _dht->readHumidity();
        float t = _dht->readTemperature();

        // --- JSON E LÓGICA DE PUBLICAÇÃO ATUALIZADOS ---
        DynamicJsonDocument doc(128);
        char payload[128];

        if (isnan(h) || isnan(t)) {
            // Caso de Erro
            Serial.printf("[DHT] Falha ao ler o sensor %s no pino %d!\n", _typeString.c_str(), _pin);
            doc["status"] = "ERRO";
            doc["erro"] = "Falha na leitura";
        } else {
            // Caso de Sucesso
            Serial.printf("[DHT] %s (Pino %d) - T:%.2f C, U:%.2f %%\n", _typeString.c_str(), _pin, t, h);
            doc["status"] = "OK";
            doc["temperatura_c"] = t;
            doc["umidade_pct"] = h;
        }

        // Serializa o JSON
        serializeJson(doc, payload, sizeof(payload));

        // Publica o JSON com verificação de segurança
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.println("[DHT] Erro: MQTT desconectado. Mensagem não enviada.");
        }
        // --- FIM DA ALTERAÇÃO ---
    }
}

// --- Implementação do getType ---
String DhtSensor::getType() {
    return _typeString;
}