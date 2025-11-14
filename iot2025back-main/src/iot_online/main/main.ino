#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "config.h"         // Nossas configurações
#include "SensorManager.h"    // Nosso gerenciador de sensores

WiFiClientSecure espClient;
PubSubClient client(espClient);


void callback(char* topic, byte* payload, unsigned int length) {
    Serial.print("Mensagem recebida no tópico: ");
    Serial.println(topic);

    payload[length] = '\0';
    String msg = (char*)payload;
    Serial.println("Payload: " + msg);

    if (String(topic) == topic_config) {
        
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload, length);

        if (error) {
            Serial.print(F("deserializeJson() falhou: "));
            Serial.println(error.f_str());
            client.publish(topic_config_response, "Erro: JSON invalido");
            return;
        }

        // --- ALTERAÇÃO AQUI ---
        // Em vez de extrair os pinos aqui...
        JsonObject config = doc.as<JsonObject>();
        const char* comando = config["comando"];

        if (String(comando) == "ADD") {
            // ...nós passamos o objeto JSON de configuração inteiro
            addSensor(config); 
        } else {
             client.publish(topic_config_response, "Erro: Comando desconhecido");
        }
        // --- FIM DA ALTERAÇÃO ---
    }else {
        // Se não for um tópico de config, provavelmente é um tópico de atuador.
        // Repassa a mensagem para o SensorManager, que entregará
        // ao objeto correto (o motor, neste caso).
        sensorManagerHandleMessage(String(topic), msg);
    }
}

void reconnect_mqtt() {
    while (!client.connected()) {
        Serial.print("Tentando conexão com o Broker MQTT seguro (sem validação de cert)...");
        if (client.connect(client_id, mqtt_user, mqtt_password)) {
            Serial.println(" SUCESSO!");
            client.publish(topic_status, "online", true);
            
            // Se inscreve no tópico de configuração
            if(client.subscribe(topic_config)) {
                Serial.printf("Inscrito com sucesso no tópico: %s\n", topic_config);
            } else {
                Serial.printf("Falha ao se inscrever no tópico: %s\n", topic_config);
            }

            if(client.subscribe("grupoX/atuador/#")) {
            Serial.println("Inscrito com sucesso no tópico de atuadores (grupoX/atuador/#)");
            } else {
                Serial.println("Falha ao se inscrever no tópico de atuadores");
            }

        } else {
            Serial.print(" falhou, rc=");
            Serial.print(client.state());
            Serial.println(". Tentando novamente em 5 segundos.");
            delay(5000);
        }
    }
}


// --- Setup e Loop Principais ---

void setup() {
    Serial.begin(115200);
    Serial.println("\nIniciando plataforma modular...");

    // --- 1. Conecta ao Wi-Fi ---
    WiFiManager wm;
    if (!wm.autoConnect("Plataforma-IoT-Config", "senha1234")) {
        Serial.println("Falha ao conectar ao Wi-Fi. Reiniciando...");
        delay(3000);
        ESP.restart();
    }
    Serial.println("\n--- CONEXÃO WI-FI ESTABELECIDA! ---");

    // --- 2. Configura o MQTT ---
    espClient.setInsecure();
    client.setServer(mqtt_server, mqtt_port);
    client.setCallback(callback); // Define a função de callback

    // --- 3. Inicializa nosso Gerenciador de Sensores ---
    // Passamos o ponteiro do cliente MQTT para ele poder usar
    sensorManagerSetup(&client);
}

void loop() {
    // 1. Mantém o MQTT conectado
    if (!client.connected()) {
        reconnect_mqtt();
    }
    client.loop(); // Processa mensagens MQTT recebidas

    // 2. Roda o loop de todos os sensores ativos
    sensorManagerLoop();

    // Pequeno delay para estabilidade
    delay(10);
}