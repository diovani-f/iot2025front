#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <MPU6050.h>

// WiFi e MQTT
const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

WiFiClient espClient;
PubSubClient client(espClient);
MPU6050 mpu;

void setup_wifi() {
  delay(10);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("MPU6050_Client")) {
      client.subscribe("sensor/mpu6050/commands");
    } else delay(5000);
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  mpu.initialize();

  setup_wifi();
  client.setServer(mqtt_server, 1883);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  String payload = "{";
  payload += "\"aceleracao_x\":" + String(ax) + ",";
  payload += "\"aceleracao_y\":" + String(ay) + ",";
  payload += "\"aceleracao_z\":" + String(az) + ",";
  payload += "\"giro_x\":" + String(gx) + ",";
  payload += "\"giro_y\":" + String(gy) + ",";
  payload += "\"giro_z\":" + String(gz);
  payload += "}";

  client.publish("sensor/mpu6050/data", payload.c_str());
  delay(100);
}