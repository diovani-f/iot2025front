# IoT 2025 Frontend

Frontend em React + TypeScript (Tailwind + shadcn/ui) para monitoramento e gestão de dispositivos IoT, integrado ao backend via REST.

## Visão Geral
- Integração com backend (VITE_API_URL) para listar dispositivos e ler séries temporais.
- Atualização quase em tempo real via polling em /api/readings/:espId.
- UI moderna com métricas, gráficos, histórico, relatórios e automações locais.

## Principais Funcionalidades
- Dashboard: Seleção de dispositivo e métrica; gráfico temporal; cards e alertas calculados em cliente.
- Dispositivos: CRUD via /api/configure, /api/device/:espId (PUT/DELETE) e /api/devices; status online/offline por “última leitura”.
- Data Visualization: Séries de temperatura/umidade por período; comparativo entre dispositivos; “tempo real” resumido.
- Histórico: Geração de eventos a partir de leituras (data/alert/system), filtros e exportação CSV.
- Automação: Regras locais (alert e schedule) com persistência em localStorage e eventos ao acionar (sem e-mail).
- Relatórios: Geração em CSV, PDF e DOCX com agregações por dispositivo/métrica (count/min/max/avg/last/unidade), capa e sumário.

## Endpoints Utilizados
- GET /api/devices
- GET /api/readings/:espId
- POST /api/configure
- PUT /api/device/:espId
- DELETE /api/device/:espId

## Requisitos
- Node 18+
- Dependências de relatórios (se for usar PDF/DOCX):
  - jspdf, jspdf-autotable
  - docx

## Instalação e Execução
```bash
pnpm i          # ou npm i / yarn
pnpm dev        # http://localhost:5173
pnpm build
pnpm preview
```

## Variáveis de Ambiente
- VITE_API_URL: Base do backend (ex.: https://iot2025back.onrender.com)

