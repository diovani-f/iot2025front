#pragma once
#include "Sensor.h" // <--- Continua herdando da classe base
#include <PubSubClient.h>

class MotorVibracao : public Sensor {
private:
    int _pin;
    String _controlTopic; // Tópico para OUVIR comandos (ex: .../vibracao/15)
    PubSubClient* _client;

public:
    // Construtor
    MotorVibracao(int pin, String topic_base, PubSubClient* mqttClient);
    
    // Funções obrigatórias
    void setup() override;
    void loop() override; // Esta ficará vazia
    String getType() override;
    
    // --- Função de Atuador ---
    // Esta é a função que será chamada pelo 'main.ino'
    void handleMqttMessage(String topic, String payload) override;
};