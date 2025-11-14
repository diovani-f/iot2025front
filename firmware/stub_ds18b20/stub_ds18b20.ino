#include <WiFi.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10"; // ajuste
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

#define ONE_WIRE_BUS 5
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(500);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST, MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("ds18_stub"); delay(500);} }

void setup(){ Serial.begin(115200); sensors.begin(); wifiConnect(); mqttConnect(); }

void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); sensors.requestTemperatures(); float t = sensors.getTempCByIndex(0); if(t > -100){ String topic = String(GROUP)+"/sensor/ds18b20/sw"+String(ONE_WIRE_BUS)+"/reading"; String payload = String("{\"temperature\":")+String(t,2)+"}"; mqtt.publish(topic.c_str(), payload.c_str()); } delay(2000); }
