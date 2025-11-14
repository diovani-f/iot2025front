// #include <ESP8266WiFi.h> Para NodeMCU ou ESP8266

// #include <WiFi.h> para ESP32
#include <WiFi.h>

#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Configurações WiFi
const char* ssid = "SUA_REDE_WIFI";
const char* password = "SUA_SENHA_WIFI";

// Configurações MQTT
const char* mqtt_server = "broker.hivemq.com"; // Ou seu broker MQTT
const char* mqtt_topic = "casa/sensor/temperatura";
const char* mqtt_client_id = "sensor_temperatura_01";

// Pino do sensor DS18B20
#define ONE_WIRE_BUS 2

// Objetos
WiFiClient espClient;
PubSubClient client(espClient);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Variáveis
unsigned long lastMsg = 0;
const long interval = 30000; // 30 segundos

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Conectando à rede: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi conectado");
  Serial.println("Endereço IP: ");
  Serial.println(WiFi.localIP());
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Mensagem recebida [");
  Serial.print(topic);
  Serial.print("]: ");

  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conexão MQTT...");

    if (client.connect(mqtt_client_id)) {
      Serial.println("Conectado ao broker MQTT!");
      client.subscribe("casa/sensor/comandos");
    } else {
      Serial.print("Falha, rc=");
      Serial.print(client.state());
      Serial.println(" Tentando novamente em 5 segundos");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Inicializar WiFi
  setup_wifi();

  // Configurar MQTT
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  // Inicializar sensor
  sensors.begin();

  Serial.println("Sensor DS18B20 inicializado");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > interval) {
    lastMsg = now;

    // Ler temperatura
    sensors.requestTemperatures();
    float temperatura = sensors.getTempCByIndex(0);

    // Verificar se a leitura é válida
    if (temperatura != DEVICE_DISCONNECTED_C) {
      // Criar JSON com os dados
      String payload = "{";
      payload += "\"sensor_id\":\"";
      payload += mqtt_client_id;
      payload += "\",";
      payload += "\"temperatura\":";
      payload += String(temperatura, 2);
      payload += ",\"unidade\":\"C\"";
      payload += ",\"timestamp\":";
      payload += String(millis());
      payload += "}";

      // Publicar no MQTT
      client.publish(mqtt_topic, payload.c_str());

      Serial.print("Temperatura publicada: ");
      Serial.print(temperatura);
      Serial.println(" °C");
    } else {
      Serial.println("Erro na leitura do sensor DS18B20");
    }
  }
}