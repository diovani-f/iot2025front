#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

// Bibliotecas Adafruit
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h> // Para I2C

class Mpu6050Sensor : public Sensor {
private:
    int _sdaPin;
    int _sclPin;
    String _topic;
    PubSubClient* _client;

    unsigned long _lastReadTime;
    unsigned long _interval; // Intervalo entre leituras (ms)

    // O ESP32 pode ter 2 barramentos I2C. Vamos criar um
    // ponteiro para um novo barramento (TwoWire) para este sensor.
    TwoWire* _i2c_bus;
    
    // Objeto do sensor da biblioteca Adafruit
    Adafruit_MPU6050 _mpu;

public:
    // Construtor
    Mpu6050Sensor(int sdaPin, int sclPin, String topic_base, PubSubClient* mqttClient, unsigned long interval = 1000);
    
    // Destrutor (para limpar o objeto I2C)
    ~Mpu6050Sensor();

    // Funções obrigatórias da classe Sensor
    void setup() override;
    void loop() override;
    String getType() override;
};