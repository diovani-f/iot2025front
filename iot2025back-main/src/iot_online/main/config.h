#pragma once

// --- Declarações (Extern) ---
// Isto diz ao compilador: "Estas variáveis existem,
// mas estão definidas em OUTRO arquivo .cpp"

extern const char* mqtt_server;
extern const int mqtt_port; 
extern const char* mqtt_user;
extern const char* mqtt_password;

extern const char* client_id;
extern const char* topic_status;
extern const char* topic_config;
extern const char* topic_config_response;

// Defines são ok, pois são substituídos pelo pré-processador
#define MAX_SENSORES 10