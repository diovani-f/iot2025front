#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoAPDS9960.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  Serial.begin(115200);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);

  if (!APDS.begin()) {
    Serial.println("Erro APDS-9960!");
    while (1);
  }
}

void loop() {
  if (!client.connected()) {
    if (client.connect("APDS9960_Client")) {
      client.subscribe("sensor/apds9960/commands");
    }
  }
  client.loop();

  // Detectar gestos
  if (APDS.gestureAvailable()) {
    int gesture = APDS.readGesture();
    String gestureStr;

    switch(gesture) {
      case GESTURE_UP: gestureStr = "UP"; break;
      case GESTURE_DOWN: gestureStr = "DOWN"; break;
      case GESTURE_LEFT: gestureStr = "LEFT"; break;
      case GESTURE_RIGHT: gestureStr = "RIGHT"; break;
      default: gestureStr = "UNKNOWN";
    }

    client.publish("sensor/apds9960/gesto", gestureStr.c_str());
  }

  // Ler cores
  if (APDS.colorAvailable()) {
    int r, g, b, a;
    APDS.readColor(r, g, b, a);

    String colorPayload = "{";
    colorPayload += "\"red\":" + String(r) + ",";
    colorPayload += "\"green\":" + String(g) + ",";
    colorPayload += "\"blue\":" + String(b) + ",";
    colorPayload += "\"ambient\":" + String(a);
    colorPayload += "}";

    client.publish("sensor/apds9960/cor", colorPayload.c_str());
  }

  delay(50);
}