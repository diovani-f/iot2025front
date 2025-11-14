#include "ReleAtuador.h"
#include <Arduino.h>

// --- Construtor ---
ReleAtuador::ReleAtuador(int pin, String topic_base, PubSubClient* mqttClient, bool invertido) {
    _pin = pin;
    _client = mqttClient;
    _invertido = invertido;
    _controlTopic = topic_base + "/" + String(pin);
}

// --- Setup ---
void ReleAtuador::setup() {
    pinMode(_pin, OUTPUT);
    
    // Se for invertido (ativo LOW), começamos com HIGH para ele ficar desligado.
    // Se for normal (ativo HIGH), começamos com LOW para ele ficar desligado.
    digitalWrite(_pin, _invertido ? HIGH : LOW);
    
    Serial.printf("[Rele] Atuador inicializado no pino %d (Invertido: %s).\n", _pin, _invertido ? "SIM" : "NAO");
    Serial.printf("[Rele] Ouvindo no tópico: %s\n", _controlTopic.c_str());
}

// --- Loop (Vazio, é reativo) ---
void ReleAtuador::loop() {}

// --- getType ---
String ReleAtuador::getType() {
    return "rele";
}

// --- Handle Message (Onde a mágica acontece) ---
void ReleAtuador::handleMqttMessage(String topic, String payload) {
    if (topic != _controlTopic) return;

    Serial.printf("[Rele] Pino %d - Comando recebido: %s\n", _pin, payload.c_str());

    if (payload == "ON") {
        // Se for invertido, LOW liga. Se normal, HIGH liga.
        digitalWrite(_pin, _invertido ? LOW : HIGH);
        
        // Opcional: Publicar confirmação de estado
        if (_client->connected()) _client->publish((_controlTopic + "/estado").c_str(), "LIGADO");

    } else if (payload == "OFF") {
        // Se for invertido, HIGH desliga. Se normal, LOW desliga.
        digitalWrite(_pin, _invertido ? HIGH : LOW);

        if (_client->connected()) _client->publish((_controlTopic + "/estado").c_str(), "DESLIGADO");

    } else {
        Serial.println("[Rele] Comando desconhecido. Use 'ON' ou 'OFF'.");
    }
}