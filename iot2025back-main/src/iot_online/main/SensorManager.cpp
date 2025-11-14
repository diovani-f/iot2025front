#include "SensorManager.h"
#include "config.h"
#include "Sensor.h"
#include <ArduinoJson.h>

// --- Lista de todos os tipos de sensores que este Manager conhece ---
#include "Botao.h"
#include "EncoderSensor.h"
#include "Hcsr04Sensor.h"
#include "IrReceiverSensor.h"
#include "Mpu6050Sensor.h"
#include "KeypadSensor.h"
#include "DhtSensor.h" // Você mencionou este erro, então o incluí
#include "Ds18b20Sensor.h"
#include "Apds9960Sensor.h" // <--- Incluído
#include "JoystickKy023Sensor.h" // <--- ADICIONE ESTA LINHA
#include "MotorVibracao.h"
#include "ReleAtuador.h"
#include "LedAtuador.h" // <--- ADICIONE ESTA LINHA

#include <Adafruit_APDS9960.h>
#include <DHT.h> // Dependência para DhtSensor

// --- Variáveis Internas do Gerenciador ---
static Sensor* sensores[MAX_SENSORES]; // O array que guarda os sensores
static int numSensores = 0;              // O contador de quantos sensores existem
static PubSubClient* _mqttClient;      // O ponteiro salvo para o cliente MQTT
static bool irReceiverActive = false;    // A flag de controle do sensor IR


// =========================================================
// ESTA É A FUNÇÃO QUE ESTAVA FALTANDO
// =========================================================
// Salva o ponteiro do cliente MQTT para uso futuro
void sensorManagerSetup(PubSubClient* client) {
    _mqttClient = client;
    numSensores = 0;
    irReceiverActive = false; // Garante que o flag do IR comece zerado
    
    // Zera o array para garantir
    for(int i=0; i<MAX_SENSORES; i++) {
        sensores[i] = nullptr;
    }
}
// =========================================================


// --- Função "Factory" que cria sensores ---
void addSensor(JsonObject config) {
    if (numSensores >= MAX_SENSORES) {
        Serial.println("[Manager] Erro: Número máximo de sensores atingido!");
        _mqttClient->publish(topic_config_response, "Erro: Maximo de sensores atingido");
        return;
    }

    String tipo = config["tipo"];
    if (tipo.isEmpty()) {
        _mqttClient->publish(topic_config_response, "Erro: 'tipo' do sensor nao especificado");
        return;
    }
    
    Serial.printf("[Manager] Tentando adicionar sensor tipo '%s'\n", tipo.c_str());
    
    if (tipo == "botao") {
        int pino = config["pino"]; // Botão espera um "pino"
        sensores[numSensores] = new Botao(pino, "grupoX/sensor/botao", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, ("OK: Botao adicionado no pino " + String(pino)).c_str());

    } else if (tipo == "encoder") {
        int pino = config["pino"];
        sensores[numSensores] = new EncoderSensor(pino, "grupoX/sensor/encoder", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, ("OK: Encoder adicionado no pino " + String(pino)).c_str());
    
    } else if (tipo == "hcsr04") {
        int pino_trig = config["pino"];
        int pino_echo = config["pino_extra"];
        if (pino_echo == 0 || pino_trig == 0) { 
            _mqttClient->publish(topic_config_response, "Erro: HC-SR04 requer 'pino' (Trig) e 'pino_extra' (Echo)");
            return;
        }
        sensores[numSensores] = new Hcsr04Sensor(pino_trig, pino_echo, "grupoX/sensor/hcsr04", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, ("OK: HC-SR04 (Trig:" + String(pino_trig) + ", Echo:" + String(pino_echo) + ")").c_str());

    } else if (tipo == "ir_receiver") {
        int pino = config["pino"];
        if (irReceiverActive) {
            _mqttClient->publish(topic_config_response, "Erro: Apenas um IrReceiver é permitido");
            return;
        }
        sensores[numSensores] = new IrReceiverSensor(pino, "grupoX/sensor/ir_receiver", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        irReceiverActive = true;
        _mqttClient->publish(topic_config_response, ("OK: IR Receiver adicionado no pino " + String(pino)).c_str());

    } else if (tipo == "mpu6050") {
        int pino_sda = config["pino"];
        int pino_scl = config["pino_extra"];
        if (pino_scl == 0 || pino_sda == 0) {
            _mqttClient->publish(topic_config_response, "Erro: MPU-6050 requer 'pino' (SDA) e 'pino_extra' (SCL)");
            return;
        }
        sensores[numSensores] = new Mpu6050Sensor(pino_sda, pino_scl, "grupoX/sensor/mpu6050", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, ("OK: MPU-6050 (SDA:" + String(pino_sda) + ", SCL:" + String(pino_scl) + ")").c_str());

    } else if (tipo == "apds9960") {
        int pino_sda = config["pino"];
        int pino_scl = config["pino_extra"];
        if (pino_scl == 0 || pino_sda == 0) {
            // CORREÇÃO: _client -> _mqttClient
            _mqttClient->publish(topic_config_response, "Erro: APDS-9960 requer 'pino' (SDA) e 'pino_extra' (SCL)");
            return;
        }
        sensores[numSensores] = new Apds9960Sensor(pino_sda, pino_scl, "grupoX/sensor/apds9960", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        String msg = "OK: APDS-9960 adicionado (SDA: " + String(pino_sda) + ", SCL: " + String(pino_scl) + ")";
        _mqttClient->publish(topic_config_response, msg.c_str());

    } else if (tipo == "dht11" || tipo == "dht22") {
        int pino = config["pino"];
        if (pino == 0 && config["pino"].as<String>() != "0") { // Checa se 'pino' existe e é válido
            _mqttClient->publish(topic_config_response, "Erro: DHT requer um 'pino' valido");
            return;
        }

        uint8_t dht_lib_type = (tipo == "dht11") ? DHT11 : DHT22;
        sensores[numSensores] = new DhtSensor(pino, dht_lib_type, tipo, "grupoX/sensor/dht", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        String msg = "OK: " + tipo + " adicionado no pino " + String(pino);
        _mqttClient->publish(topic_config_response, msg.c_str());

    } else if (tipo == "ds18b20") {
        int pino = config["pino"];
        if (!config.containsKey("pino")) {
            _mqttClient->publish(topic_config_response, "Erro: ds18b20 requer um 'pino'");
            return;
        }
        sensores[numSensores] = new Ds18b20Sensor(pino, "grupoX/sensor/ds18b20", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, ("OK: DS18B20 adicionado no pino " + String(pino)).c_str());

    }else if (tipo == "joystick_ky023") {
        JsonArray pinArray = config["pinos"]; // Espera um array "pinos"
        if (pinArray.isNull() || pinArray.size() != 3) {
            _mqttClient->publish(topic_config_response, "Erro: joystick_ky023 requer um array 'pinos' com 3 pinos (X, Y, SW)");
            return;
        }

        // Aloca os 3 pinos na memória
        byte* pins = new byte[3];
        pins[0] = pinArray[0]; // X_PIN
        pins[1] = pinArray[1]; // Y_PIN
        pins[2] = pinArray[2]; // SW_PIN

        // O construtor padrão usará 250ms de intervalo
        sensores[numSensores] = new JoystickKy023Sensor(pins, "grupoX/sensor/joystick", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;

        String msg = "OK: Joystick adicionado (X:" + String(pins[0]) + ", Y:" + String(pins[1]) + ", SW:" + String(pins[2]) + ")";
        _mqttClient->publish(topic_config_response, msg.c_str());
    } else if (tipo == "rele") {
        int pino = config["pino"];
        if (!config.containsKey("pino")) {
            _mqttClient->publish(topic_config_response, "Erro: rele requer um 'pino'");
            return;
        }

        // Verifica se o JSON tem a chave "invertido": true/false
        bool invertido = config.containsKey("invertido") ? config["invertido"].as<bool>() : false;

        sensores[numSensores] = new ReleAtuador(pino, "grupoX/atuador/rele", _mqttClient, invertido);
        sensores[numSensores]->setup();
        numSensores++;

        String msg = "OK: Rele adicionado no pino " + String(pino);
        _mqttClient->publish(topic_config_response, msg.c_str());

    }else if (tipo == "motor_vibracao") {
        int pino = config["pino"];
        if (!config.containsKey("pino")) {
            _mqttClient->publish(topic_config_response, "Erro: motor_vibracao requer um 'pino'");
            return;
        }

        // Note o tópico base "grupoX/atuador/vibracao"
        sensores[numSensores] = new MotorVibracao(pino, "grupoX/atuador/vibracao", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;

        String msg = "OK: Motor de Vibracao adicionado no pino " + String(pino);
        _mqttClient->publish(topic_config_response, msg.c_str());
    } else if (tipo == "motor_vibracao") { // <--- VERIFIQUE ESTA LINHA
        int pino = config["pino"];
        if (!config.containsKey("pino")) {
            _mqttClient->publish(topic_config_response, "Erro: motor_vibracao requer um 'pino'");
            return;
        }

        // Note o tópico base "grupoX/atuador/vibracao"
        sensores[numSensores] = new MotorVibracao(pino, "grupoX/atuador/vibracao", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;

        String msg = "OK: Motor de Vibracao adicionado no pino " + String(pino);
        _mqttClient->publish(topic_config_response, msg.c_str());

    } else if (tipo == "led") {
        int pino = config["pino"];
        if (!config.containsKey("pino")) {
            _mqttClient->publish(topic_config_response, "Erro: led requer um 'pino'");
            return;
        }

        sensores[numSensores] = new LedAtuador(pino, "grupoX/atuador/led", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;

        String msg = "OK: LED adicionado no pino " + String(pino);
        _mqttClient->publish(topic_config_response, msg.c_str());

    } else if (tipo == "keypad4x4") {
        JsonArray pinArray = config["pinos"]; // Espera um array "pinos"
        if (pinArray.isNull() || pinArray.size() != 8) {
            _mqttClient->publish(topic_config_response, "Erro: keypad4x4 requer um array 'pinos' com 8 pinos (4 linhas, 4 colunas)");
            return;
        }

        byte* rowPins = new byte[4];
        byte* colPins = new byte[4];
        for(int i=0; i<4; i++) rowPins[i] = pinArray[i];      // Primeiros 4 pinos são Linhas
        for(int i=0; i<4; i++) colPins[i] = pinArray[i+4];  // Próximos 4 pinos são Colunas

        sensores[numSensores] = new KeypadSensor(rowPins, colPins, "grupoX/sensor/keypad", _mqttClient);
        sensores[numSensores]->setup();
        numSensores++;
        _mqttClient->publish(topic_config_response, "OK: Keypad 4x4 adicionado");

    } else {
        Serial.printf("[Manager] Erro: Tipo de sensor desconhecido '%s'\n", tipo.c_str());
        String msg = "Erro: Tipo de sensor desconhecido " + tipo;
        _mqttClient->publish(topic_config_response, msg.c_str());
    }
}

// Roda o loop() de cada sensor ativo
void sensorManagerLoop() {
    for (int i = 0; i < numSensores; i++) {
        if (sensores[i] != nullptr) {
            sensores[i]->loop();
        }
    }
}

void sensorManagerHandleMessage(String topic, String payload) {
    for (int i = 0; i < numSensores; i++) {
        if (sensores[i] != nullptr) {
            // Cada objeto (Botao, DHT, Motor) receberá a msg.
            // Apenas o objeto correto (Motor) irá reagir.
            sensores[i]->handleMqttMessage(topic, payload);
        }
    }
}