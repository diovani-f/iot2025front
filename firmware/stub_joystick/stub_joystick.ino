#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID="YOUR_WIFI"; const char* WIFI_PASS="YOUR_PASS"; const char* MQTT_HOST="192.168.0.10"; const uint16_t MQTT_PORT=1883; const char* GROUP="grupo4";

const int X_PIN = 34; // ADC
const int Y_PIN = 35; // ADC
const int SW_PIN = 25; // botão
WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(300);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST,MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("joystick_stub"); delay(500);} }

void setup(){ Serial.begin(115200); pinMode(SW_PIN, INPUT_PULLUP); wifiConnect(); mqttConnect(); }

void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); int x=analogRead(X_PIN); int y=analogRead(Y_PIN); int sw=digitalRead(SW_PIN)==LOW?1:0; String topic=String(GROUP)+"/sensor/joystick/sw"+String(X_PIN)+"/reading"; String payload=String("{\"x\":")+x+",\"y\":"+y+",\"sw\":"+sw+"}"; mqtt.publish(topic.c_str(), payload.c_str()); delay(800); }
