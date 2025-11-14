#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10";
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

const int LED_GREEN = 15;
const int LED_YELLOW = 2;
const int LED_RED = 4;

WiFiClient espClient;
PubSubClient mqtt(espClient);

void wifiConnect(){
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status()!=WL_CONNECTED){ delay(500);}  
}

void setLed(int pin, bool on){
  digitalWrite(pin, on ? HIGH : LOW);
}

void mqttCallback(char* topic, byte* payload, unsigned int len){
  String msg; for (unsigned int i=0;i<len;i++) msg += (char)payload[i];
  String t = String(topic);
  if (t.endsWith(String("/") + String(LED_GREEN))) setLed(LED_GREEN, msg == "ON");
  if (t.endsWith(String("/") + String(LED_YELLOW))) setLed(LED_YELLOW, msg == "ON");
  if (t.endsWith(String("/") + String(LED_RED))) setLed(LED_RED, msg == "ON");
}

void mqttConnect(){
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while(!mqtt.connected()){
    String cid = String("esp4_") + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqtt.connect(cid.c_str());
    delay(500);
  }
  String t1 = String(GROUP) + "/atuador/led/" + String(LED_GREEN);
  String t2 = String(GROUP) + "/atuador/led/" + String(LED_YELLOW);
  String t3 = String(GROUP) + "/atuador/led/" + String(LED_RED);
  mqtt.subscribe(t1.c_str());
  mqtt.subscribe(t2.c_str());
  mqtt.subscribe(t3.c_str());
}

void setup(){
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  setLed(LED_GREEN, false); setLed(LED_YELLOW, false); setLed(LED_RED, false);
  Serial.begin(115200);
  wifiConnect();
  mqtt.setCallback(mqttCallback);
  mqttConnect();
}

void loop(){
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();
  delay(10);
}
