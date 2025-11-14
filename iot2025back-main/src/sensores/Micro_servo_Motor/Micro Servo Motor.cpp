#include <WiFi.h>
#include <PubSubClient.h>
#include <Servo.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

#define SERVO_PIN 9

Servo meuServo;
WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  if (String(topic) == "atuador/servo/angulo") {
    int angulo = message.toInt();
    if (angulo >= 0 && angulo <= 180) {
      meuServo.write(angulo);
      String status = "{\"angulo\":" + String(angulo) + "}";
      client.publish("atuador/servo/status", status.c_str());
    }
  }
}

void setup() {
  meuServo.attach(SERVO_PIN);
  meuServo.write(90); // Posição inicial

  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("Servo_Client")) {
      client.subscribe("atuador/servo/angulo");
      client.publish("atuador/servo/status", "{\"status\":\"PRONTO\"}");
    } else delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();
}