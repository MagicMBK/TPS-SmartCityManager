/**
 * PuntoSnai — Local Mock Server
 * Espone endpoint HTTP reali per gRPC, GraphQL, SOAP, MQTT.
 * Avviato in parallelo a Vite con: npm run dev
 * Porta: 3001
 */

import express from 'express';
import cors from 'cors';
import { grpcRouter } from './grpcRoutes';
import { graphqlRouter } from './graphqlRoutes';
import { soapRouter } from './soapRoutes';
import { mqttRouter } from './mqttRoutes';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(express.text({ type: 'text/xml' }));
app.use(express.text({ type: 'application/soap+xml' }));

// ── Route ──────────────────────────────────────────────────────────────────
app.use('/grpc',    grpcRouter);
app.use('/graphql', graphqlRouter);
app.use('/soap',    soapRouter);
app.use('/mqtt',    mqttRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    services: ['gRPC', 'GraphQL', 'SOAP', 'MQTT'],
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PuntoSnai Mock Server running on http://localhost:${PORT}`);
  console.log(`   gRPC    → POST http://localhost:${PORT}/grpc/detectAnomaly`);
  console.log(`   gRPC    → POST http://localhost:${PORT}/grpc/predictTraffic`);
  console.log(`   GraphQL → POST http://localhost:${PORT}/graphql`);
  console.log(`   SOAP    → POST http://localhost:${PORT}/soap`);
  console.log(`   MQTT    → POST http://localhost:${PORT}/mqtt/publish\n`);
});