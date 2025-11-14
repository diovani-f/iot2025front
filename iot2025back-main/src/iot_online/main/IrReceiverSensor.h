#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class IrReceiverSensor : public Sensor {
private:
    int _pin;
    String _topic;
    PubSubClient* _client;

public:
    // Construtor
    IrReceiverSensor(int pin, String topic_base, PubSubClient* mqttClient);
    
    // Destrutor (para parar o receptor)
    ~IrReceiverSensor(); 

    // Funções obrigatórias da classe Sensor
    void setup() override;
    void loop() override;
    String getType() override;
};