#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

// Bibliotecas que acabamos de instalar
#include <Adafruit_Sensor.h>
#include <DHT.h>

class DhtSensor : public Sensor {
private:
    int _pin;
    uint8_t _dht_type;     // Tipo do sensor (DHT11, DHT22, etc.)
    String _typeString;    // "dht11" ou "dht22" (para a função getType)
    String _topic;
    PubSubClient* _client;

    unsigned long _lastReadTime;
    unsigned long _interval; // DHTs são lentos, não leia muito rápido

    // Ponteiro para o objeto da biblioteca DHT
    DHT* _dht; 

public:
    // Construtor
    DhtSensor(int pin, uint8_t dht_type, String typeString, String topic_base, PubSubClient* mqttClient, unsigned long interval = 2000);
    
    // Destrutor (para liberar o objeto DHT)
    ~DhtSensor(); 

    // Funções obrigatórias
    void setup() override;
    void loop() override;
    String getType() override;
};