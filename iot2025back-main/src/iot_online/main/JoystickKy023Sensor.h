#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class JoystickKy023Sensor : public Sensor {
private:
    byte* _pins; // Array para [PIN_X, PIN_Y, PIN_SW]
    
    String _baseTopic;
    PubSubClient* _client;

    unsigned long _lastReadTime;
    unsigned long _interval; // Intervalo para X/Y
    int _lastSwState; // Para o botão

public:
    // Construtor
    // 250ms é um bom intervalo para joystick
    JoystickKy023Sensor(byte* pins, String topic_base, PubSubClient* mqttClient, unsigned long interval = 250);
    
    // Destrutor (para liberar a memória dos pinos)
    ~JoystickKy023Sensor(); 

    // Funções obrigatórias
    void setup() override;
    void loop() override;
    String getType() override;
};