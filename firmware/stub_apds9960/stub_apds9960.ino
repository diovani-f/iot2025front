#include <WiFi.h>
#include <PubSubClient.h>
// Bibliotecas específicas do APDS9960 podem ser incluídas (ex: SparkFun_APDS9960.h)

const char* WIFI_SSID="YOUR_WIFI"; const char* WIFI_PASS="YOUR_PASS"; const char* MQTT_HOST="192.168.0.10"; const uint16_t MQTT_PORT=1883; const char* GROUP="grupo4";

WiFiClient espClient; PubSubClient mqtt(espClient);

void wifiConnect(){ WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASS); while(WiFi.status()!=WL_CONNECTED){ delay(300);} }
void mqttConnect(){ mqtt.setServer(MQTT_HOST,MQTT_PORT); while(!mqtt.connected()){ mqtt.connect("apds9960_stub"); delay(500);} }

void setup(){ Serial.begin(115200); wifiConnect(); mqttConnect(); /* inicializar sensor real aqui */ }

void loop(){ if(!mqtt.connected()) mqttConnect(); mqtt.loop(); // valores simulados
 int gesture = 0; int proximity = 120; int r=30,g=40,b=50; int lux=75; 
 String topic=String(GROUP)+"/sensor/apds9960/sw18/reading"; 
 String payload=String("{\"gesture\":")+gesture+",\"proximity\":"+proximity+",\"r\":"+r+",\"g\":"+g+",\"b\":"+b+",\"lux\":"+lux+"}"; 
 mqtt.publish(topic.c_str(), payload.c_str());
 delay(1500); }
