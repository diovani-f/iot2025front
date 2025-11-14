#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID="YOUR_WIFI"; const char* WIFI_PASS="YOUR_PASS"; const char* MQTT_HOST="192.168.0.10"; const uint16_t MQTT_PORT=1883; const char* GROUP="grupo4";

const int TRIG_PIN=12; const int ECHO_PIN=13;
WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(300);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST,MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("hcsr04_stub"); delay(500);} }

long measure(){ digitalWrite(TRIG_PIN,LOW); delayMicroseconds(2); digitalWrite(TRIG_PIN,HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN,LOW); long d=pulseIn(ECHO_PIN,HIGH,30000); return d/58; }

void setup(){ pinMode(TRIG_PIN,OUTPUT); pinMode(ECHO_PIN,INPUT); Serial.begin(115200); wifiConnect(); mqttConnect(); }
void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); long dist=measure(); String topic=String(GROUP)+"/sensor/hcsr04/sw"+String(TRIG_PIN)+"/reading"; String payload=String("{\"distance_cm\":")+String(dist)+"}"; mqtt.publish(topic.c_str(), payload.c_str()); delay(1000); }
