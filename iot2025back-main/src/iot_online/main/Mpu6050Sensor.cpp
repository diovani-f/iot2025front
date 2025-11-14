#include "Mpu6050Sensor.h"
#include <Arduino.h>
#include <ArduinoJson.h> // <--- Já estava aqui

// --- Implementação do Construtor ---
Mpu6050Sensor::Mpu6050Sensor(int sdaPin, int sclPin, String topic_base, PubSubClient* mqttClient, unsigned long interval) 
    : _i2c_bus(new TwoWire(0)) {
    
    _sdaPin = sdaPin;
    _sclPin = sclPin;
    _client = mqttClient;
    _interval = interval;
    _lastReadTime = 0;
    _topic = topic_base + "/sda" + String(sdaPin);
}

// --- Implementação do Destrutor ---
Mpu6050Sensor::~Mpu6050Sensor() {
    delete _i2c_bus;
}

// --- Implementação do Setup ---
void Mpu6050Sensor::setup() {
    // 1. Inicia o barramento I2C nos pinos especificados
    _i2c_bus->begin(_sdaPin, _sclPin);

    // 2. Inicia o sensor MPU6050 neste barramento
    // CORREÇÃO 1: A função 'begin' espera o endereço (opcional) primeiro, 
    // e o barramento I2C (wire) depois.
    if (!_mpu.begin(MPU6050_I2CADDR_DEFAULT, _i2c_bus)) { 
        Serial.printf("[MPU6050] Erro ao inicializar sensor nos pinos SDA:%d, SCL:%d\n", _sdaPin, _sclPin);
        return;
    }

    // 3. Configura os ranges (opcional, mas recomendado)
    _mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    
    // CORREÇÃO 2: A biblioteca usa _DEG (Degrees) e não _DPS (Degrees Per Second)
    _mpu.setGyroRange(MPU6050_RANGE_500_DEG); 
    
    _mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

    Serial.printf("[MPU6050] Sensor inicializado. SDA:%d, SCL:%d. Publicando em %s\n", _sdaPin, _sclPin, _topic.c_str());
}

// --- Implementação do Loop ---
void Mpu6050Sensor::loop() {
    if (millis() - _lastReadTime >= _interval) {
        _lastReadTime = millis();

        sensors_event_t a, g, temp;
        _mpu.getEvent(&a, &g, &temp);

        // --- Cria o Payload JSON ---
        DynamicJsonDocument doc(256);

        // ADIÇÃO: Inclui um status no JSON
        doc["status"] = "OK";
        
        // Cria um sub-objeto para o acelerômetro
        JsonObject accel = doc.createNestedObject("acelerometro");
        accel["x"] = a.acceleration.x;
        accel["y"] = a.acceleration.y;
        accel["z"] = a.acceleration.z;

        // Cria um sub-objeto para o giroscópio
        JsonObject gyro = doc.createNestedObject("giroscopio");
        gyro["x"] = g.gyro.x;
        gyro["y"] = g.gyro.y;
        gyro["z"] = g.gyro.z;
        
        doc["temperatura_c"] = temp.temperature;

        // --- Publica o JSON ---
        char payload[256];
        serializeJson(doc, payload, sizeof(payload));

        Serial.printf("[MPU6050] SDA %d - Publicando JSON: %s\n", _sdaPin, payload);
        
        // --- CORREÇÃO DE SEGURANÇA ---
        if (_client->connected()) {
            _client->publish(_topic.c_str(), payload);
        } else {
            Serial.println("[MPU6050] Erro: MQTT desconectado. Mensagem não enviada.");
        }
    }
}

// --- Implementação do getType ---
String Mpu6050Sensor::getType() {
    return "mpu6050";
}