#pragma once
#include <Arduino.h> // Precisamos para a classe "String"

// Classe base abstrata para todos os sensores
class Sensor {
public:
    // Destrutor virtual (necessário para classes base)
    virtual ~Sensor() {} 
    
    // Todo sensor DEVE implementar uma função setup()
    virtual void setup() = 0; 
    
    // Todo sensor DEVE implementar uma função loop()
    virtual void loop() = 0; 
    
    // Todo sensor DEVE retornar seu tipo
    virtual String getType() = 0; 

    virtual void handleMqttMessage(String topic, String payload) {}
};

