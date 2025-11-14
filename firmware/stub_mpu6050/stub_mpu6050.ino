#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10";
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

const int MPU_ADDR = 0x68;

WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(300);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST, MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("mpu6050_stub"); delay(500);} }

void setup(){ Wire.begin(); Serial.begin(115200); wifiConnect(); mqttConnect(); Wire.beginTransmission(MPU_ADDR); Wire.write(0x6B); Wire.write(0); Wire.endTransmission(true); }

void readMPU(float &ax,float &ay,float &az){ Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B); Wire.endTransmission(false); Wire.requestFrom(MPU_ADDR,6,true); ax=Wire.read()<<8|Wire.read(); ay=Wire.read()<<8|Wire.read(); az=Wire.read()<<8|Wire.read(); ax/=16384.0; ay/=16384.0; az/=16384.0; }

void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); float ax,ay,az; readMPU(ax,ay,az); String topic=String(GROUP)+"/sensor/mpu6050/sw21/reading"; String payload=String("{\"ax\":")+String(ax,2)+",\"ay\":"+String(ay,2)+",\"az\":"+String(az,2)+"}"; mqtt.publish(topic.c_str(), payload.c_str()); delay(1000); }
