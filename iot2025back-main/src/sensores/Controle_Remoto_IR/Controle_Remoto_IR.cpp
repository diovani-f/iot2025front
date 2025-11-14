#include <WiFi.h>
#include <PubSubClient.h>
#include <IRremote.h>

const char* ssid = "SUA_REDE";
const char* password = "SUA_SENHA";
const char* mqtt_server = "broker.hivemq.com";

#define IR_RECEIVER_PIN 11

WiFiClient espClient;
PubSubClient client(espClient);
IRrecv irrecv(IR_RECEIVER_PIN);
decode_results results;

void setup() {
  Serial.begin(115200);
  irrecv.enableIRIn();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("IR_Receiver_Client")) {
      client.subscribe("ir/commands");
      client.publish("ir/status", "RECEPTOR_PRONTO");
    } else delay(5000);
  }
}

String getIRType(decode_results *results) {
  switch(results->decode_type) {
    case NEC: return "NEC";
    case SONY: return "SONY";
    case RC5: return "RC5";
    case RC6: return "RC6";
    case UNKNOWN: return "UNKNOWN";
    default: return "OTHER";
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  if (irrecv.decode(&results)) {
    String payload = "{";
    payload += "\"tipo\":\"" + getIRType(&results) + "\",";
    payload += "\"valor\":\"" + String(results->value, HEX) + "\",";
    payload += "\"bits\":" + String(results->bits);
    payload += "}";

    client.publish("ir/recebido", payload.c_str());

    Serial.println("IR Recebido: " + String(results->value, HEX));
    irrecv.resume();
  }

  delay(100);
}