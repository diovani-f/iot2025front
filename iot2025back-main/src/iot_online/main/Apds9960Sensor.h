#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

// Bibliotecas Adafruit
#include <Adafruit_APDS9960.h>
#include <Wire.h> // Para I2C

class Apds9960Sensor : public Sensor {
private:
    int _sdaPin;
    int _sclPin;
    String _baseTopic; // Tópico base (ex: .../apds9960/sda21)
    PubSubClient* _client;

    unsigned long _lastReadTime;
    unsigned long _interval; // Intervalo para Proximidade/Cor/Luz

    // Barramento I2C separado
    TwoWire* _i2c_bus;
    
    // Objeto do sensor da biblioteca Adafruit
    Adafruit_APDS9960 _apds;

public:
    // Construtor
    // Usaremos o barramento I2C 1 (MPU usou o 0)
    Apds9960Sensor(int sdaPin, int sclPin, String topic_base, PubSubClient* mqttClient, unsigned long interval = 500);
    
    // Destrutor (para limpar o objeto I2C)
    ~Apds9960Sensor();

    // Funções obrigatórias
    void setup() override;
    void loop() override;
    String getType() override;
};