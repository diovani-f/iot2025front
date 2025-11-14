#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

#define RELE_PIN 8

WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  if (String(topic) == "atuador/rele/controle") {
    if (message == "ON" || message == "1") {
      digitalWrite(RELE_PIN, HIGH);
      client.publish("atuador/rele/status", "LIGADO");
    } else if (message == "OFF" || message == "0") {
      digitalWrite(RELE_PIN, LOW);
      client.publish("atuador/rele/status", "DESLIGADO");
    }
  }
}

void setup() {
  pinMode(RELE_PIN, OUTPUT);
  digitalWrite(RELE_PIN, LOW);

  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("Rele_Client")) {
      client.subscribe("atuador/rele/controle");
      client.publish("atuador/rele/status", "PRONTO");
    } else delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();
}