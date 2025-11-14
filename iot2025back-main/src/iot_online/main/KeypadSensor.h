#pragma once
#include "Sensor.h"
#include <PubSubClient.h>
#include <Keypad.h> // Biblioteca que acabamos de instalar

class KeypadSensor : public Sensor {
private:
    byte* _rowPins; // Ponteiro para os 4 pinos de linha
    byte* _colPins; // Ponteiro para os 4 pinos de coluna
    
    // Keymap 4x4
    char _keys[4][4] = {
      {'1','2','3','A'},
      {'4','5','6','B'},
      {'7','8','9','C'},
      {'*','0','#','D'}
    };

    Keypad* _keypad; // Ponteiro para o objeto Keypad
    
    String _topic;
    PubSubClient* _client;

public:
    // Construtor
    KeypadSensor(byte* rowPins, byte* colPins, String topic_base, PubSubClient* mqttClient);
    
    // Destrutor (para liberar a memória dos pinos)
    ~KeypadSensor(); 

    // Funções obrigatórias
    void setup() override;
    void loop() override;
    String getType() override;
};