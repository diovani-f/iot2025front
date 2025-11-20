# IoT 2025 Frontend

Frontend em React + TypeScript (Tailwind + shadcn/ui) para monitoramento e gestão de dispositivos IoT, integrado ao backend via REST.

## 🎯 Visão Geral
- Integração com backend (VITE_API_URL) para listar dispositivos e ler séries temporais
- Atualização quase em tempo real via polling
- UI moderna com métricas, gráficos, histórico, relatórios e automações locais
- Design responsivo com tema dark e animações suaves

## ✨ Principais Funcionalidades

### 📊 Dashboard
- Seleção de dispositivo e métrica
- Gráfico temporal interativo
- Cards e alertas calculados em cliente
- Status online/offline em tempo real

### 🔧 Dispositivos
- Cadastro e gerenciamento de dispositivos ESP32
- Configuração de componentes (sensores/atuadores)
- Reenvio de configurações via MQTT
- Monitoramento de status (online/offline)

### 📈 Visualização de Dados
- Séries temporais de temperatura/umidade
- Comparativo entre dispositivos
- Atualização em "tempo real"
- Filtros por período

### 📜 Histórico
- Geração de eventos a partir de leituras
- Filtros avançados (data/tipo/dispositivo)
- Exportação CSV

### ⚡ Automação
- Regras locais (alertas e agendamentos)
- Persistência em localStorage
- Eventos ao acionar condições
- Configurações personalizadas

### 📄 Relatórios
- Geração em CSV, PDF e DOCX
- Agregações por dispositivo/métrica
- Estatísticas (count/min/max/avg)
- Capa e sumário profissionais

## 🔌 Endpoints da API

### Dispositivos
- `POST /api/configure` - Configurar dispositivo ESP32
- `POST /api/device/:espId/resend` - Reenviar configuração

### Leituras
- `GET /api/readings/:espId` - Listar todas as leituras
- `GET /api/readings/:espId/latest` - Última leitura do dispositivo

### Atuadores
- `POST /api/actuator` - Enviar comando para atuador

### Regras
- `GET /api/rules` - Listar regras de automação
- `POST /api/rules` - Criar regra
- `DELETE /api/rules/:id` - Deletar regra

## 📋 Requisitos
- Node 18+
- npm, yarn ou pnpm
- Backend iot2025 rodando

### Dependências de Relatórios
- jspdf, jspdf-autotable (para PDF)
- docx (para DOCX)

## 🚀 Instalação e Execução

```bash
# Instalar dependências
npm install
# ou
pnpm install
# ou
yarn install

# Executar em desenvolvimento
npm run dev        # http://localhost:5173

# Build para produção
npm run build

# Preview da build
npm run preview
```

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_API_URL=http://localhost:3000
```

Para produção, ajuste para a URL do seu backend:
```env
VITE_API_URL=https://seu-backend.com
```

## 🎨 Melhorias Implementadas

### Visual
- ✅ Animações suaves (fade-in, slide-in)
- ✅ Efeitos glass morphism
- ✅ Hover effects com lift
- ✅ Scrollbar customizada
- ✅ Smooth scrolling
- ✅ Gradientes animados

### Funcional
- ✅ Endpoints corrigidos para match com backend
- ✅ Componente LoadingSpinner reutilizável
- ✅ Melhor tratamento de erros
- ✅ Performance otimizada

## 📁 Estrutura do Projeto

```
src/
├── components/       # Componentes reutilizáveis
│   ├── ui/          # Componentes shadcn/ui
│   ├── AppLayout.tsx
│   └── LoadingSpinner.tsx
├── pages/           # Páginas da aplicação
│   ├── Index.tsx
│   ├── Devices.tsx
│   ├── DataVisualization.tsx
│   ├── Automation.tsx
│   ├── History.tsx
│   └── Reports.tsx
├── lib/             # Utilitários e helpers
│   ├── api.ts
│   ├── device-registry.ts
│   └── readings-utils.ts
└── index.css        # Estilos globais e design system
```

## 🤝 Integração com Backend

Este frontend foi desenvolvido para funcionar com o backend **iot2025back**. Certifique-se de que:

1. O backend está rodando na porta 3000 (ou ajuste VITE_API_URL)
2. CORS está habilitado no backend
3. MongoDB está conectado
4. Broker MQTT está configurado

## 📝 Notas

- As automações são armazenadas localmente no navegador (localStorage)
- Os dispositivos também são gerenciados localmente
- As leituras vêm do backend via API REST
- Comandos para atuadores são enviados via backend para MQTT
```
