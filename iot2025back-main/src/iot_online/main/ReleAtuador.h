#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class ReleAtuador : public Sensor {
private:
    int _pin;
    String _controlTopic;
    PubSubClient* _client;
    bool _invertido; // Alguns módulos relé são "Ativo Baixo" (LOW liga, HIGH desliga)

public:
    // Construtor
    // Adicionei um parâmetro opcional 'invertido' para relés que ligam com LOW
    ReleAtuador(int pin, String topic_base, PubSubClient* mqttClient, bool invertido = false);
    
    void setup() override;
    void loop() override;
    String getType() override;
    void handleMqttMessage(String topic, String payload) override;
};