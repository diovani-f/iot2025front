#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

// Bibliotecas necessárias para o sensor
#include <OneWire.h>
#include <DallasTemperature.h>

class Ds18b20Sensor : public Sensor {
private:
    int _pin;
    String _topic;
    PubSubClient* _client;

    unsigned long _lastReadTime;
    unsigned long _interval; // Intervalo entre leituras (ms)

    // Ponteiros para os objetos da biblioteca
    OneWire* _oneWireBus;
    DallasTemperature* _dallasSensors;

public:
    // Construtor
    // 5000ms (5 segundos) é um bom intervalo padrão para temperatura
    Ds18b20Sensor(int pin, String topic_base, PubSubClient* mqttClient, unsigned long interval = 5000);
    
    // Destrutor (para limpar os ponteiros)
    ~Ds18b20Sensor();

    // Funções obrigatórias
    void setup() override;
    void loop() override;
    String getType() override;
};