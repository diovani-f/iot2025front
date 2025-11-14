#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10";
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

const int RELAY_PIN = 27; // ajuste
const int ENCODER_PIN = 14; // ajuste (interrupt se possível)

WiFiClient espClient;
PubSubClient mqtt(espClient);

volatile bool lastState = false;
unsigned long lastPublish = 0;

void IRAM_ATTR encISR() {
  lastState = digitalRead(ENCODER_PIN);
}

void wifiConnect(){
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status()!=WL_CONNECTED) { delay(500); }
}

void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String msg; for (unsigned int i=0;i<len;i++) msg += (char)payload[i];
  String t = String(topic);
  if (t.endsWith(String("/") + String(RELAY_PIN))) {
    if (msg == "ON") digitalWrite(RELAY_PIN, HIGH); else digitalWrite(RELAY_PIN, LOW);
  }
}

void mqttConnect(){
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while (!mqtt.connected()) {
    String cid = String("esp2_") + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqtt.connect(cid.c_str());
    delay(500);
  }
  String relTopic = String(GROUP) + "/atuador/rele/" + String(RELAY_PIN);
  mqtt.subscribe(relTopic.c_str());
}

void setup(){
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  pinMode(ENCODER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_PIN), encISR, CHANGE);

  Serial.begin(115200);
  wifiConnect();
  mqtt.setCallback(mqttCallback);
  mqttConnect();
}

void loop(){
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  // publica estado da porta a cada 200ms
  unsigned long now = millis();
  if (now - lastPublish > 200) {
    lastPublish = now;
    bool open = (lastState == HIGH); // ajuste conforme fiação (HIGH = aberto?)
    String topic = String(GROUP) + "/sensor/encoder/sw" + String(ENCODER_PIN) + "/state";
    if (open) mqtt.publish(topic.c_str(), "OPEN"); else mqtt.publish(topic.c_str(), "CLOSED");
  }
}
