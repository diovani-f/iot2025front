#include "IrReceiverSensor.h"
#include <Arduino.h>
#include <IRremote.h>
#include <ArduinoJson.h> // <--- ADICIONADO

// --- Implementação do Construtor ---
IrReceiverSensor::IrReceiverSensor(int pin, String topic_base, PubSubClient* mqttClient) {
    _pin = pin;
    _client = mqttClient;
    _topic = topic_base + "/" + String(pin); 
}

// --- Implementação do Destrutor ---
IrReceiverSensor::~IrReceiverSensor() {
    IrReceiver.stop();
    Serial.printf("[IR Receiver] Sensor (global) parado no pino %d.\n", _pin);
}

// --- Implementação do Setup ---
void IrReceiverSensor::setup() {
    IrReceiver.begin(_pin, ENABLE_LED_FEEDBACK);
    Serial.printf("[IR Receiver] Sensor (global) iniciado no pino %d. Publicando em %s\n", _pin, _topic.c_str());
}

// --- Implementação do Loop ---
void IrReceiverSensor::loop() {
    if (IrReceiver.decode()) {
        
        unsigned long hexValue = IrReceiver.decodedIRData.decodedRawData;

        if (hexValue != 0) {
            Serial.printf("[IR Receiver] Pino %d - Código recebido: 0x%lX\n", _pin, hexValue);

            // --- LÓGICA JSON ADICIONADA ---

            // 1. Converte o valor HEX para uma String
            char hexString[12];
            sprintf(hexString, "0x%lX", hexValue);

            // 2. Cria o documento JSON
            DynamicJsonDocument doc(128);
            doc["status"] = "OK";
            doc["codigo_hex"] = hexString;

            // 3. Serializa o JSON
            char payload[128];
            serializeJson(doc, payload, sizeof(payload));

            // 4. Publica o JSON com verificação de segurança
            if (_client->connected()) {
                _client->publish(_topic.c_str(), payload);
            } else {
                Serial.println("[IR Receiver] Erro: MQTT desconectado. Mensagem não enviada.");
            }
            // --- FIM DA ALTERAÇÃO ---
        }
        IrReceiver.resume(); 
    }
}

// --- Implementação do getType ---
String IrReceiverSensor::getType() {
    return "ir_receiver";
}