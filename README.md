<div align="center">

```
██████╗ ██╗   ██╗███╗   ██╗████████╗ ██████╗ ███████╗███╗   ██╗ █████╗ ██╗
██╔══██╗██║   ██║████╗  ██║╚══██╔══╝██╔═══██╗██╔════╝████╗  ██║██╔══██╗██║
██████╔╝██║   ██║██╔██╗ ██║   ██║   ██║   ██║███████╗██╔██╗ ██║███████║██║
██╔═══╝ ██║   ██║██║╚██╗██║   ██║   ██║   ██║╚════██║██║╚██╗██║██╔══██║██║
██║     ╚██████╔╝██║ ╚████║   ██║   ╚██████╔╝███████║██║ ╚████║██║  ██║██║
╚═╝      ╚═════╝ ╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝
```

**Smart City Command Center** — IoT Platform con AI, Digital Twin 3D e 5 protocolli reali

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)

</div>

---

## 🏙️ Cos'è PuntoSnai

PuntoSnai(**S**mart-**N**ode-**A**PI-**I**nterface) è una **Single Page Application** che simula il centro di controllo di una smart city. 36 sensori IoT distribuiti in 9 zone urbane generano dati in tempo reale ogni 2 secondi: traffico, qualità dell'aria, temperatura, rumore, consumo energetico.

Il sistema integra **cinque protocolli industriali reali** (REST, gRPC, GraphQL, SOAP, MQTT) con un backend Express locale, un database PostgreSQL cloud su Supabase, un Digital Twin 3D della città e un motore AI per anomaly detection e traffic prediction — il tutto scritto in TypeScript puro, senza dipendenze ML esterne.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (:5173)                              │
│                                                                     │
│  React 19 SPA ──► CitySimulator.tick() ogni 2s                     │
│       │                    │                                        │
│       │         ┌──────────┼──────────┐                            │
│       │         ▼          ▼          ▼                            │
│       │    Supabase    mqttPublish   IndexedDB                     │
│       │    (cloud)      (/api/mqtt)  (browser)                     │
│       │                    │                                        │
│       └──────► Proxy Vite /api/* ──────────────┐                   │
│                                                │                   │
└────────────────────────────────────────────────┼───────────────────┘
                                                 │
                                    ┌────────────▼──────────────┐
                                    │   Express Server (:3001)   │
                                    │                            │
                                    │  /grpc    → AI anomaly     │
                                    │  /graphql → query engine   │
                                    │  /soap    → XML parser     │
                                    │  /mqtt    → broker bridge  │
                                    └────────────────────────────┘
```

---

## ✨ Features

| Feature | Descrizione |
|---------|-------------|
| 🗺️ **Digital Twin 3D** | Rappresentazione Three.js della città con sensori animati in tempo reale |
| 🤖 **AI Engine** | Isolation Forest (anomaly detection) + Random Forest (traffic prediction) in TypeScript puro |
| 📡 **5 Protocolli** | REST · gRPC · GraphQL · SOAP · MQTT — tutti con fetch() HTTP reali |
| 🗄️ **Dual Storage** | Supabase PostgreSQL cloud + IndexedDB browser-side per offline support |
| 📊 **Dashboard Live** | Grafici real-time con storico 60 snapshot, alert panel, zone metrics |
| 🔍 **GraphQL Explorer** | Playground integrato con schema SDL, query predefinite e tracing |
| 📋 **SOAP Console** | Terminale XML per PagamentoMulta, VerificaVeicolo, ReportZona |
| 🎮 **Crisis Game** | Minigame di gestione emergenze basato sui dati dei sensori |
| 🏗️ **Architecture View** | Vista visuale dell'architettura del sistema con stato live |

---

## 🗺️ Le 9 Zone Urbane

```
┌─────────────────────────────────────────────────────┐
│   Res. Nord      Parco Urbano     Zona Commerciale   │
│   🏘️  AQI 78     🌳  AQI 92      🛍️  traffic 85     │
│                                                     │
│   Zona Ospe.    Centro Storico    Zona Industriale  │
│   🏥  noise 45   🏛️  traffic 75   🏭  energy 95     │
│                                                     │
│   Res. Sud      Campus Univ.     Porto / Logistica  │
│   🏘️  AQI 75    🎓  traffic 50   🚢  noise 65       │
└─────────────────────────────────────────────────────┘
```

Ogni zona ha **4 sensori attivi** (traffic · air_quality · temperature · noise · energy) con anomaly detection automatica: score > 0.8 → `critical`, > 0.6 → `warning`.

---

## 🏗️ Stack Tecnico

```
Frontend
├── React 19          UI framework con concurrent features
├── Vite 7            Build tool + dev server + proxy
├── TypeScript 5      Type safety end-to-end
├── Three.js r128     Digital Twin 3D rendering
└── Recharts          Grafici real-time

Backend (locale)
├── Express 4         Server HTTP su porta 3001
├── cors              CORS per localhost:5173
├── xml2js            Parsing SOAP envelope XML
└── tsx + concurrently  Hot-reload TypeScript server

Database & Storage
├── Supabase          PostgreSQL cloud (readings, alerts, grpc_calls)
├── IndexedDB         Browser storage persistente (offline-first)
└── TimescaleStore    In-memory per grafici real-time

AI (TypeScript puro)
├── IsolationForest   Anomaly detection unsupervised
└── RandomForest      Traffic prediction supervised
```

---

## 🚀 Avvio del Progetto

### Prerequisiti

- **Node.js** v18+ 
- **npm** v9+
- Connessione internet (per Supabase)

### 1. Clona e installa

```bash
git clone https://github.com/tuo-username/TPS-SmartCityManager.git
cd TPS-SmartCityManager

npm install
```

### 2. Installa dipendenze backend

```bash
npm install concurrently tsx express cors xml2js
npm install -D @types/express @types/cors @types/xml2js
```

### 3. Avvio con un solo comando ⚡

```bash
npm run dev
```

Questo avvia **in parallelo**:
- 🌐 **Vite** su `http://localhost:5173` — il frontend React
- ⚙️ **Express** su `http://localhost:3001` — il server dei protocolli

---

### Avvio alternativo (due terminali separati)

Se `concurrently` non funziona o preferisci vedere i log separati:

**Terminale 1 — Backend Express:**
```bash
cd TPS-SmartCityManager
npx tsx server/index.ts
```

Dovresti vedere:
```
🚀 PuntoSnai Mock Server running on http://localhost:3001
   gRPC    → POST http://localhost:3001/grpc/detectAnomaly
   gRPC    → POST http://localhost:3001/grpc/predictTraffic
   GraphQL → POST http://localhost:3001/graphql
   SOAP    → POST http://localhost:3001/soap
   MQTT    → POST http://localhost:3001/mqtt/publish
```

**Terminale 2 — Frontend Vite:**
```bash
cd TPS-SmartCityManager
npx vite
```

Apri `http://localhost:5173` nel browser.

---

### Verifica che tutto funzioni

Apri **Chrome DevTools → F12 → tab Network** e filtra per `localhost` o `supabase`. Dovresti vedere chiamate reali:

| Chiamata | Frequenza | Status |
|----------|-----------|--------|
| `POST supabase.co/rest/v1/readings` | ogni ~10s | `201 Created` |
| `POST localhost:3001/mqtt/publish` | ogni 2s | `200 OK` |
| `POST localhost:3001/grpc/detectAnomaly` | on demand | `200 OK` |
| `POST localhost:3001/graphql` | on demand | `200 OK` |
| `POST localhost:3001/soap` | on demand | `200 OK` |

---

### Troubleshooting

<details>
<summary>❌ <code>ECONNREFUSED</code> su <code>/mqtt/publish</code> nel terminale</summary>

Express non è avviato. Avvia il backend prima:
```bash
npx tsx server/index.ts
```
Il frontend gestisce questi errori silenziosamente — la UI funziona comunque in modalità offline.

</details>

<details>
<summary>❌ <code>ERR_MODULE_NOT_FOUND</code> per <code>server/index.ts</code></summary>

La cartella `server/` non esiste o è nella posizione sbagliata. Deve essere nella **root** del progetto, non dentro `src/`:
```
TPS-SmartCityManager/   ← qui
├── server/
│   ├── index.ts
│   ├── grpcRoutes.ts
│   ├── graphqlRoutes.ts
│   ├── soapRoutes.ts
│   └── mqttRoutes.ts
└── src/
```

</details>

<details>
<summary>❌ Porta 3001 già in uso</summary>

```bash
# macOS / Linux
lsof -ti :3001 | xargs kill

# Windows PowerShell
netstat -ano | findstr :3001
# poi: taskkill /PID <numero> /F
```

</details>

<details>
<summary>❌ Errori Supabase (401 / 403)</summary>

La chiave Supabase è inclusa nel codice per demo. Se scaduta, aggiorna in `src/services/supabaseClient.ts`:
```ts
const SUPABASE_URL = 'https://hqekyxrmswdxgpdruiap.supabase.co'
const SUPABASE_ANON_KEY = 'la-tua-chiave'
```

</details>

---

## 📁 Struttura del Progetto

```
TPS-SmartCityManager/
│
├── server/                         ← Express backend (porta 3001)
│   ├── index.ts                    ← Entry point, CORS, routing
│   ├── grpcRoutes.ts               ← /grpc/detectAnomaly + /grpc/predictTraffic
│   ├── graphqlRoutes.ts            ← /graphql (resolver completo)
│   ├── soapRoutes.ts               ← /soap (XML parser con xml2js)
│   └── mqttRoutes.ts               ← /mqtt/publish + /mqtt/subscribe
│
├── src/
│   ├── ai/
│   │   ├── SmartCityAI.ts          ← IsolationForest + RandomForest (TS puro)
│   │   └── grpcSimulator.ts        ← fetch() reali → /api/grpc/*
│   │
│   ├── data/
│   │   └── sensorSimulator.ts      ← CitySimulator, 36 sensori, tick ogni 2s
│   │
│   ├── services/
│   │   ├── supabaseClient.ts       ← Config Supabase
│   │   ├── supabaseService.ts      ← fetch() → supabase.co/rest/v1/
│   │   ├── graphqlSimulator.ts     ← fetch() → /api/graphql + fallback locale
│   │   ├── soapSimulator.ts        ← fetch() → /api/soap (SOAP envelope XML)
│   │   ├── indexedDBStore.ts       ← Browser IndexedDB API
│   │   └── timescaleStore.ts       ← In-memory time-series store
│   │
│   └── components/                 ← 14 componenti React
│       ├── LandingPage.tsx
│       ├── Dashboard.tsx           ← Dashboard principale con grafici
│       ├── DigitalTwin3D.tsx       ← Visualizzazione Three.js
│       ├── AIServicePanel.tsx      ← Pannello AI con gRPC calls
│       ├── GraphQLExplorer.tsx     ← Playground GraphQL integrato
│       ├── SOAPConsole.tsx         ← Console SOAP/XML
│       ├── AlertPanel.tsx          ← Alert real-time
│       ├── ZoneDetail.tsx          ← Dettaglio zona con sensori
│       ├── CrisisGame.tsx          ← Minigame gestione emergenze
│       ├── ArchitectureView.tsx    ← Vista architettura sistema
│       └── ...
│
├── vite.config.ts                  ← Proxy /api/* → localhost:3001
├── package.json                    ← Scripts: dev = vite + tsx
└── tsconfig.json
```

---

## 📡 I 5 Protocolli in Dettaglio

### 🟢 REST — Supabase PostgreSQL

Ogni lettura sensore viene accodata e inviata in batch da 5 a Supabase:

```typescript
// supabaseService.ts
await fetch(`${SUPABASE_URL}/rest/v1/readings`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  },
  body: JSON.stringify(batch),
});
```

### 🟣 gRPC — AI Anomaly Detection

Bridge HTTP verso Express che simula un server gRPC con Protocol Buffers:

```typescript
// grpcSimulator.ts
await fetch('/api/grpc/detectAnomaly', {
  method: 'POST',
  headers: { 'X-GRPC-Method': 'SmartCityAI/DetectAnomaly' },
  body: JSON.stringify({ readings, modelVersion: 'isolation-forest-v2' }),
});
```

### 🩷 GraphQL — Query Engine

Fetch POST standard con query SDL e fallback locale se Express è offline:

```typescript
// graphqlSimulator.ts
await fetch('/api/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables }),
});
```

### 🟡 SOAP — Sistema Municipale

SOAP Envelope XML completo con SOAPAction header:

```typescript
// soapSimulator.ts
await fetch('/api/soap', {
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '"http://puntosnai.it/municipio/v1/PagamentoMulta"',
  },
  body: soapEnvelopeXml,
});
```

### 🔵 MQTT — IoT Broker Bridge

Fire-and-forget publish su topic `smartcity/sensors/<type>` — anomalie anche su `smartcity/alerts/<severity>` con QoS 2 e retain:

```typescript
// sensorSimulator.ts
fetch('/api/mqtt/publish', {
  method: 'POST',
  body: JSON.stringify({
    topic: `smartcity/sensors/${reading.type}`,
    payload: { ...reading },
    qos: reading.status === 'critical' ? 1 : 0,
  }),
}).catch(() => {}); // fire & forget
```

---

## 🤖 AI Engine

Tutto scritto in TypeScript, zero dipendenze ML:

**Isolation Forest** — anomaly detection unsupervised
- Costruisce 100 alberi di isolamento su campioni da 256 punti
- Path length normalizzato → score 0-1
- Score > 0.8 → `critical` · Score > 0.6 → `warning`

**Random Forest** — traffic prediction supervised  
- Feature engineering: ora, giorno, rush hour, weekend, baseline zona
- Bagging di N decision tree → media predizioni
- Predice traffico per le prossime N ore con confidence score

---

## 🗄️ Database

### Supabase (PostgreSQL cloud)

```
Tabelle:
  readings    → sensor_id, type, value, unit, zone, status, timestamp
  alerts      → sensor_id, type, severity, message, zone, timestamp
  grpc_calls  → method, request, response, duration_ms, timestamp
```

Dashboard: https://supabase.com/dashboard/project/hqekyxrmswdxgpdruiap/editor

### IndexedDB (browser)

Backup locale di tutte le letture e alert. Sopravvive al refresh, accessibile offline. Object store con indici su `zone`, `type`, `timestamp`.

---

## 🔧 Configurazione Proxy Vite

Il proxy Vite mappa `/api/*` → `localhost:3001/*` eliminando il prefisso:

```typescript
// vite.config.ts
proxy: {
  '/api/mqtt':    { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api\/mqtt/, '/mqtt'),
                    configure: proxy => proxy.on('error', () => {}) },
  '/api/graphql': { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api\/graphql/, '/graphql') },
  '/api/grpc':    { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api\/grpc/, '/grpc') },
  '/api/soap':    { target: 'http://localhost:3001', rewrite: p => p.replace(/^\/api\/soap/, '/soap') },
}
```

---

## 📊 Componenti Principali

| Componente | Cosa fa |
|-----------|---------|
| `Dashboard.tsx` | Vista principale con grafici Recharts, stats card, alert live |
| `DigitalTwin3D.tsx` | Rendering Three.js della città, sensori come sfere animate |
| `AIServicePanel.tsx` | Chiama `/api/grpc/*`, mostra anomalie e predizioni traffico |
| `GraphQLExplorer.tsx` | Playground con schema SDL, history, tracing Apollo-style |
| `SOAPConsole.tsx` | Terminale XML, mostra envelope request/response formattati |
| `AlertPanel.tsx` | Feed real-time alert con ack, filtri severity, toast notifications |
| `CrisisGame.tsx` | Minigame: risolvi emergenze nei 9 quartieri prima del timeout |
| `ArchitectureView.tsx` | Diagramma interattivo dell'architettura con status live |
| `SupabaseConsole.tsx` | Query SQL diretta al database, visualizza le tabelle |
| `TimescaleConsole.tsx` | Esplora i dati time-series, esporta CSV |

---

## 🌐 MQTT Topics

| Topic | QoS | Retain | Quando |
|-------|-----|--------|--------|
| `smartcity/sensors/traffic` | 0 | No | Ogni lettura traffico |
| `smartcity/sensors/air_quality` | 0 | No | Ogni lettura qualità aria |
| `smartcity/sensors/temperature` | 0 | No | Ogni lettura temperatura |
| `smartcity/sensors/noise` | 0 | No | Ogni lettura rumore |
| `smartcity/sensors/energy` | 0 | No | Ogni lettura energia |
| `smartcity/alerts/warning` | 2 | **Sì** | Anomalia warning rilevata |
| `smartcity/alerts/critical` | 2 | **Sì** | Anomalia critica rilevata |

---

## 👨‍💻 Sviluppato con

- **React 19** + Concurrent Mode per UI fluida anche durante heavy updates
- **Vite 7** con HMR istantaneo e proxy integrato
- **TypeScript strict** — nessun `any` nei tipi critici
- **Three.js r128** per il Digital Twin (no WebGPU richiesto)
- **Recharts** per i grafici SVG real-time
- **Supabase** come backend-as-a-service PostgreSQL
- **ReportLab** per la generazione della documentazione PDF

---

<div align="center">

**PuntoSnai** — Progetto didattico per TPS (Tecnologie e Progettazione di Sistemi)

*Dimostra l'integrazione di 5 protocolli industriali (REST · gRPC · GraphQL · SOAP · MQTT) in una SPA TypeScript con AI, Digital Twin 3D e persistenza cloud.*

</div>
