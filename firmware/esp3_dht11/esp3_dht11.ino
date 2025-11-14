#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10";
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

WiFiClient espClient;
PubSubClient mqtt(espClient);

void wifiConnect(){
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status()!=WL_CONNECTED){ delay(500);}  
}

void mqttConnect(){
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while(!mqtt.connected()){
    String cid = String("esp3_") + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqtt.connect(cid.c_str());
    delay(500);
  }
}

void setup(){
  Serial.begin(115200);
  dht.begin();
  wifiConnect();
  mqttConnect();
}

void loop(){
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)){
    String topic = String(GROUP) + "/sensor/dht11/sw" + String(DHTPIN) + "/reading";
    String payload = String("{\"temperature\":") + String(t,1) + ",\"humidity\":" + String(h,1) + "}";
    mqtt.publish(topic.c_str(), payload.c_str());
  }
  delay(1000);
}
