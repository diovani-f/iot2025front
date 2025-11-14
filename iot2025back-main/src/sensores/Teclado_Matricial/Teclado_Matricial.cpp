#include <WiFi.h>
#include <PubSubClient.h>
#include <Keypad.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte rowPins[ROWS] = {9, 8, 7, 6};
byte colPins[COLS] = {5, 4, 3, 2};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("Keypad_Client")) {
      client.subscribe("teclado/commands");
    } else delay(5000);
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  char key = keypad.getKey();

  if (key) {
    String payload = "{\"tecla\":\"";
    payload += key;
    payload += "\"}";

    client.publish("teclado/pressionado", payload.c_str());
    Serial.println("Tecla pressionada: " + String(key));
  }

  delay(50);
}