#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

#define VRX_PIN A0
#define VRY_PIN A1
#define SW_PIN  2

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  pinMode(SW_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("Joystick_Client")) {
      client.subscribe("sensor/joystick/commands");
    } else delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  int xValue = analogRead(VRX_PIN);
  int yValue = analogRead(VRY_PIN);
  int buttonState = digitalRead(SW_PIN);

  String payload = "{";
  payload += "\"eixo_x\":" + String(xValue) + ",";
  payload += "\"eixo_y\":" + String(yValue) + ",";
  payload += "\"botao\":" + String(buttonState);
  payload += "}";

  client.publish("sensor/joystick/data", payload.c_str());
  delay(100);
}