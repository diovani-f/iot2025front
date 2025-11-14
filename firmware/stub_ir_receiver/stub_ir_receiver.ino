#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID="YOUR_WIFI"; const char* WIFI_PASS="YOUR_PASS"; const char* MQTT_HOST="192.168.0.10"; const uint16_t MQTT_PORT=1883; const char* GROUP="grupo4";

const int IR_PIN = 23; // ajuste conforme circuito
WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(300);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST,MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("ir_stub"); delay(500);} }

void setup(){ Serial.begin(115200); wifiConnect(); mqttConnect(); }

void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); // exemplo: simular código IR
 unsigned long code = 0x1FE48B7; // substitua por leitura real
 String topic = String(GROUP)+"/sensor/ir_receiver/sw"+String(IR_PIN)+"/reading";
 String payload = String("{\"code\":")+String((unsigned long)code)+"}";
 mqtt.publish(topic.c_str(), payload.c_str());
 delay(3000); }
