#include "Botao.h"
#include <Arduino.h> // Para Serial, pinMode, digitalRead, etc.

// Implementação do Construtor
Botao::Botao(int pin, String topic_base, PubSubClient* mqttClient) {
    _pin = pin;
    _client = mqttClient;
    // Cria o tópico dinâmico
    _topic = topic_base + "/" + String(pin); 
    _estadoAnterior = HIGH; // Assume PULLUP
}

// Implementação do Setup
void Botao::setup() {
    pinMode(_pin, INPUT_PULLUP);
    _estadoAnterior = digitalRead(_pin); // Lê o estado inicial
    Serial.printf("[Botao] Sensor inicializado no pino %d. Publicando em %s\n", _pin, _topic.c_str());
}

// Implementação do Loop
void Botao::loop() {
    int estadoAtual = digitalRead(_pin);

    if (_estadoAnterior == HIGH && estadoAtual == LOW) {
        Serial.printf("[Botao] Pino %d pressionado!\n", _pin);
        
        // Publica no tópico MQTT
        _client->publish(_topic.c_str(), "pressionado");
        delay(50); // Debounce simples
    }
    _estadoAnterior = estadoAtual;
}

// Implementação do getType
String Botao::getType() {
    return "botao";
}