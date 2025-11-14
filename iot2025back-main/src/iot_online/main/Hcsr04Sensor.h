#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class Hcsr04Sensor : public Sensor {
private:
    int _trigPin;
    int _echoPin;
    String _topic;
    PubSubClient* _client;

    unsigned long _lastReadTime;  // Para o timer
    unsigned long _interval;      // Intervalo entre leituras (ms)

    // Função interna que faz a medição
    float readDistance();

public:
    // Construtor
    Hcsr04Sensor(int trigPin, int echoPin, String topic_base, PubSubClient* mqttClient, unsigned long interval = 500);

    // Funções obrigatórias da classe Sensor
    void setup() override;
    void loop() override;
    String getType() override;
};