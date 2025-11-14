#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class LedAtuador : public Sensor {
private:
    int _pin;
    String _controlTopic; // Tópico para OUVIR comandos
    PubSubClient* _client;

public:
    // Construtor
    LedAtuador(int pin, String topic_base, PubSubClient* mqttClient);
    
    // Funções obrigatórias
    void setup() override;
    void loop() override; // Ficará vazia
    String getType() override;
    
    // Função que reage a comandos MQTT
    void handleMqttMessage(String topic, String payload) override;
};