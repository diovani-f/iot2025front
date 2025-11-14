#pragma once
#include "Sensor.h"       // Inclui a classe base
#include <PubSubClient.h> // Precisamos da definição do PubSubClient

class Botao : public Sensor {
private:
    // Variáveis internas (privadas)
    int _pin;
    String _topic;
    PubSubClient* _client; // Ponteiro para o cliente MQTT principal
    int _estadoAnterior;

public:
    // Construtor: chamado quando criamos o objeto
    Botao(int pin, String topic_base, PubSubClient* mqttClient);

    // Funções obrigatórias da classe Sensor
    void setup() override;
    void loop() override;
    String getType() override;
};