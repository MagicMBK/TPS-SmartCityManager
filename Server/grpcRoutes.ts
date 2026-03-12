/**
 * gRPC Routes — Simula il server Python grpcio su porta 50052
 * Esposto via HTTP/JSON per compatibilità browser.
 * In produzione questi sarebbero metodi .proto su un vero gRPC server.
 */

import { Router } from 'express';

export const grpcRouter = Router();

// Parametri normali per tipo sensore (stesso algoritmo di SmartCityAI.ts)
const NORMAL_PARAMS: Record<string, { mean: number; std: number }> = {
  traffic:     { mean: 50,  std: 25 },
  air_quality: { mean: 65,  std: 20 },
  temperature: { mean: 27,  std: 4  },
  noise:       { mean: 55,  std: 18 },
  energy:      { mean: 65,  std: 20 },
};

function isolationForestScore(value: number, mean: number, std: number): number {
  const z = Math.abs((value - mean) / (std || 1));
  return Math.min(1, z / 3);
}

// ── RPC: DetectAnomaly ──────────────────────────────────────────────────────
// proto: rpc DetectAnomaly(SensorReading) returns (AnomalyResult)
grpcRouter.post('/detectAnomaly', (req, res) => {
  const { sensor_id, type, value, zone, timestamp } = req.body;

  if (value === undefined || !type) {
    return res.status(400).json({
      grpc_status: 'INVALID_ARGUMENT',
      error: 'Missing required fields: type, value',
    });
  }

  const params = NORMAL_PARAMS[type] ?? { mean: 50, std: 20 };
  const anomalyScore = isolationForestScore(value, params.mean, params.std);
  const isAnomaly = anomalyScore > 0.7;

  const processingMs = Math.round(1 + Math.random() * 3);

  // Simula processing time reale del server
  setTimeout(() => {
    res.json({
      grpc_status:        'OK',
      sensor_id:          sensor_id ?? 'unknown',
      is_anomaly:         isAnomaly,
      anomaly_score:      Math.round(anomalyScore * 1000) / 1000,
      confidence:         Math.round((0.85 + Math.random() * 0.1) * 100) / 100,
      algorithm:          'IsolationForest_v2',
      processing_time_ms: processingMs,
      timestamp:          timestamp ?? Date.now(),
      zone:               zone ?? 'unknown',
      details: {
        z_score:     Math.round(Math.abs((value - params.mean) / params.std) * 100) / 100,
        mean:        params.mean,
        std:         params.std,
        threshold:   0.7,
      },
    });
  }, processingMs);
});

// ── RPC: PredictTraffic ─────────────────────────────────────────────────────
// proto: rpc PredictTraffic(TrafficRequest) returns (TrafficPrediction)
grpcRouter.post('/predictTraffic', (req, res) => {
  const { zone, current_value, hour, history } = req.body;

  if (current_value === undefined) {
    return res.status(400).json({
      grpc_status: 'INVALID_ARGUMENT',
      error: 'Missing required field: current_value',
    });
  }

  const h = hour ?? new Date().getHours();
  const historyArr: number[] = history ?? [current_value];

  const hourWeight  = Math.sin((h - 6) * Math.PI / 12) * 0.4 + 0.6;
  const rushBonus   = (h >= 7 && h <= 9) || (h >= 17 && h <= 19) ? 1.3 : 1.0;
  const trend       = historyArr.length > 1
    ? (historyArr[historyArr.length - 1] - historyArr[0]) / historyArr.length
    : 0;

  const predicted = Math.max(0, Math.min(100,
    current_value * hourWeight * rushBonus + trend * 0.5 + (Math.random() - 0.5) * 8
  ));

  const processingMs = Math.round(2 + Math.random() * 5);

  setTimeout(() => {
    res.json({
      grpc_status:        'OK',
      zone:               zone ?? 'unknown',
      predicted_value:    Math.round(predicted * 10) / 10,
      confidence:         Math.round((0.78 + Math.random() * 0.15) * 100) / 100,
      horizon_minutes:    30,
      algorithm:          'RandomForest_v3',
      processing_time_ms: processingMs,
      features_used: {
        hour_of_day:   h,
        hour_weight:   Math.round(hourWeight * 100) / 100,
        rush_hour:     rushBonus > 1,
        trend:         Math.round(trend * 100) / 100,
        history_len:   historyArr.length,
      },
    });
  }, processingMs);
});

// ── RPC: GetModelStatus ─────────────────────────────────────────────────────
const modelStatusHandler = (_req: import('express').Request, res: import('express').Response) => {
  res.json({
    grpc_status: 'OK',
    models: [
      {
        name:          'IsolationForest',
        version:       '2.1.0',
        status:        'ready',
        accuracy:      0.94,
        last_trained:  '2024-01-15T00:00:00Z',
        total_calls:   Math.floor(Math.random() * 10000) + 5000,
      },
      {
        name:          'RandomForest',
        version:       '3.0.1',
        status:        'ready',
        accuracy:      0.89,
        last_trained:  '2024-01-14T00:00:00Z',
        total_calls:   Math.floor(Math.random() * 8000) + 3000,
      },
    ],
  });
};

grpcRouter.get('/modelStatus',  modelStatusHandler);
grpcRouter.post('/modelStatus', modelStatusHandler);
