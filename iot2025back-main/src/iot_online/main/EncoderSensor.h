#pragma once
#include "Sensor.h"
#include <PubSubClient.h>

class EncoderSensor : public Sensor {
private:
    int _pin;
    String _topic;
    PubSubClient* _client;


    // 'volatile' é crucial para variáveis usadas em interrupções
    volatile unsigned long _pulseCount; 
    
    unsigned long _lastCalcTime;  // Para o timer de 1 segundo
    unsigned long _interval;      // Intervalo de publicação (ms)

    // A função da interrupção (ISR) precisa ser 'static'
    // IRAM_ATTR garante que ela rode da RAM, que é mais rápido
    static void IRAM_ATTR isr_wrapper(void* arg);

    // Método interno que a ISR vai chamar
    void handleInterrupt();

public:
    // Construtor
    EncoderSensor(int pin, String topic_base, PubSubClient* mqttClient, unsigned long interval = 1000);

    // Funções obrigatórias da classe Sensor
    void setup() override;
    void loop() override;
    String getType() override;
};