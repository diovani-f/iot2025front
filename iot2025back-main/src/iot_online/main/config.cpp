#include "config.h" // Inclui as declarações extern para checagem

#if defined(__has_include)
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#endif

// --- Definições ---
// Aqui é onde as variáveis realmente "vivem" na memória
// e recebem seus valores.

#ifndef MQTT_SERVER_DEFAULT
#define MQTT_SERVER_DEFAULT "mqtt.example.com"
#endif

#ifndef MQTT_PORT_DEFAULT
#define MQTT_PORT_DEFAULT 8883
#endif

#ifndef MQTT_USER_DEFAULT
#define MQTT_USER_DEFAULT ""
#endif

#ifndef MQTT_PASSWORD_DEFAULT
#define MQTT_PASSWORD_DEFAULT ""
#endif

#ifndef MQTT_CLIENT_ID_DEFAULT
#define MQTT_CLIENT_ID_DEFAULT "esp32-dlsc808-grupoX-01"
#endif

#ifndef MQTT_GROUP_DEFAULT
#define MQTT_GROUP_DEFAULT "grupoX"
#endif

const char* mqtt_server = MQTT_SERVER_DEFAULT;
const int mqtt_port = MQTT_PORT_DEFAULT;
const char* mqtt_user = MQTT_USER_DEFAULT;
const char* mqtt_password = MQTT_PASSWORD_DEFAULT;

const char* client_id = MQTT_CLIENT_ID_DEFAULT;
const char* topic_status = MQTT_GROUP_DEFAULT "/status";
const char* topic_config = MQTT_GROUP_DEFAULT "/config";
const char* topic_config_response = MQTT_GROUP_DEFAULT "/config/response";

// Note que MAX_SENSORES não precisa vir aqui, pois é um #define