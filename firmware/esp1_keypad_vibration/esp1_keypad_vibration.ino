#include <WiFi.h>
#include <PubSubClient.h>

// CONFIGURE
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* MQTT_HOST = "192.168.0.10"; // ou ip do mosquitto
const uint16_t MQTT_PORT = 1883;
const char* GROUP = "grupo4";

// Pinos
const int VIB_PIN = 26; // ajustável

WiFiClient espClient;
PubSubClient mqtt(espClient);

String bufferPwd = "";

void wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void mqttConnect() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while (!mqtt.connected()) {
    String cid = String("esp1_") + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqtt.connect(cid.c_str());
    delay(500);
  }
  // atuador vibração
  String vibTopic = String(GROUP) + "/atuador/vibracao/" + String(VIB_PIN);
  mqtt.subscribe(vibTopic.c_str());
}

void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i=0;i<len;i++) msg += (char)payload[i];
  String t = String(topic);
  if (t.endsWith(String("/") + String(VIB_PIN))) {
    if (msg == "ON") { digitalWrite(VIB_PIN, HIGH); }
    else { digitalWrite(VIB_PIN, LOW); }
  }
}

void setup() {
  pinMode(VIB_PIN, OUTPUT);
  digitalWrite(VIB_PIN, LOW);
  Serial.begin(115200);
  wifiConnect();
  mqtt.setCallback(mqttCallback);
  mqttConnect();
  Serial.println("Digite *1234 no Serial para simular senha correta");
}

void loop() {
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  // Simulação via Serial: digite caracteres, ENTER envia como senha
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      // publica senha
      String topic = String(GROUP) + "/sensor/keypad/sw33/password"; // swXX apenas para compor o tópico
      mqtt.publish(topic.c_str(), bufferPwd.c_str());
      bufferPwd = "";
    } else {
      bufferPwd += c;
    }
  }

  delay(10);
}
