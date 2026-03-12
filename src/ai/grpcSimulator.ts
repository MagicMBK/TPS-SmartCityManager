/**
 * gRPC Simulator — Strato di trasporto simulato
 * ==============================================
 * Simula la comunicazione gRPC tra i microservizi come definito
 * nel file city_service.proto.
 *
 * In produzione questo modulo sarebbe sostituito da:
 *  - @grpc/grpc-js sul backend Node.js
 *  - grpcio sul servizio Python
 *
 * Qui simula latenza di rete, serializzazione Protobuf,
 * streaming RPC e gestione degli errori.
 *
 * @module gRPCSimulator
 */

import type {
  Proto_SensorReading,
  Proto_AnomalyResult,
  Proto_TrafficRequest,
  Proto_TrafficPrediction,
  Proto_ModelStatus,
} from './SmartCityAI';
import { aiLogger } from './SmartCityAI';
import type { SensorReading } from '../data/sensorSimulator';

// ============================================================
// TIPI gRPC
// ============================================================

export type GrpcStatusCode =
  | 'OK'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'INVALID_ARGUMENT'
  | 'DEADLINE_EXCEEDED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_EXHAUSTED'
  | 'INTERNAL';

export interface GrpcMetadata {
  'content-type': 'application/grpc+proto';
  'x-service-name': string;
  'x-request-id': string;
  'x-processing-time-ms'?: number;
}

export interface GrpcCall<TRequest, TResponse> {
  requestId:    string;
  service:      string;
  method:       string;
  request:      TRequest;
  response?:    TResponse;
  status:       GrpcStatusCode;
  metadata:     GrpcMetadata;
  startTime:    number;
  endTime?:     number;
  latencyMs?:   number;
}

export interface GrpcStreamEvent<T> {
  type:      'data' | 'error' | 'end';
  data?:     T;
  error?:    string;
  timestamp: number;
}

// ============================================================
// CALL LOG — Storico delle chiamate gRPC
// ============================================================

export interface GrpcCallLog {
  id:           string;
  timestamp:    number;
  service:      'AIService' | 'DataProcessor' | 'AlertService';
  method:       string;
  status:       GrpcStatusCode;
  latencyMs:    number;
  request:      string;   // JSON stringificato
  response:     string;   // JSON stringificato
}

class GrpcCallRegistry {
  private calls: GrpcCallLog[] = [];
  private listeners: Set<(log: GrpcCallLog) => void> = new Set();
  readonly maxCalls = 200;

  record(log: GrpcCallLog) {
    this.calls.unshift(log);
    if (this.calls.length > this.maxCalls) this.calls.pop();
    this.listeners.forEach(l => l(log));
  }

  subscribe(fn: (log: GrpcCallLog) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getCalls(): GrpcCallLog[] { return [...this.calls]; }
  clear() { this.calls = []; }
}

export const grpcCallRegistry = new GrpcCallRegistry();




// ============================================================
// gRPC STUB — AIService
// Implementa i metodi definiti nel .proto
// ============================================================

export class AIServiceStub {
  private readonly serviceName = 'AIService';
  private readonly endpoint    = 'ai-service:50052';  // Come nel docker-compose
  private connected            = true;
  private totalCalls           = 0;

  constructor() {
    aiLogger.info('gRPCStub', `Connessione a ${this.endpoint} stabilita`, {
      service: this.serviceName,
      protocol: 'grpc+proto',
    });
  }

  /** Serializza il messaggio Protobuf (simulato) */
  private serialize<T>(msg: T): string {
    return JSON.stringify(msg);
  }

  private makeRequestId(): string {
    return `rq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // ── RPC: DetectAnomaly ──────────────────────────────────────────
  /**
   * Chiama l'RPC DetectAnomaly via HTTP → Express :3001.
   * Se il server è offline lancia UNAVAILABLE invece di usare fallback locale.
   */
  async detectAnomaly(reading: Proto_SensorReading): Promise<GrpcCall<Proto_SensorReading, Proto_AnomalyResult>> {
    const requestId = this.makeRequestId();
    const startTime = performance.now();
    this.totalCalls++;

    let status: GrpcStatusCode = 'OK';
    let response: Proto_AnomalyResult | undefined;

    try {
      const res = await fetch('/api/grpc/detectAnomaly', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-GRPC-Method': 'AIService/DetectAnomaly',
          'X-Request-ID':  requestId,
        },
        body: JSON.stringify({
          sensor_id: reading.sensor_id,
          type:      reading.type,
          value:     reading.value,
          zone:      reading.zone,
          timestamp: reading.timestamp,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      response = await res.json() as Proto_AnomalyResult;
    } catch (err) {
      // Server Express offline o errore rete → UNAVAILABLE, nessun fallback
      status = 'UNAVAILABLE';
      aiLogger.error('gRPCStub', `DetectAnomaly: server offline — ${err}`, { request_id: requestId });
    }

    const latencyMs = Math.round(performance.now() - startTime);

    const log: GrpcCallLog = {
      id:        requestId,
      timestamp: Date.now(),
      service:   'AIService',
      method:    'DetectAnomaly',
      status,
      latencyMs,
      request:   this.serialize({ sensor_id: reading.sensor_id, type: reading.type, value: reading.value }),
      response:  this.serialize(response ?? { error: status }),
    };
    grpcCallRegistry.record(log);

    return {
      requestId,
      service:  this.serviceName,
      method:   'DetectAnomaly',
      request:  reading,
      response,
      status,
      metadata: {
        'content-type':          'application/grpc+proto',
        'x-service-name':        this.serviceName,
        'x-request-id':          requestId,
        'x-processing-time-ms':  response?.processing_time_ms,
      },
      startTime,
      endTime:   performance.now(),
      latencyMs,
    };
  }

  // ── RPC: PredictTraffic ──────────────────────────────────────────
  /**
   * Chiama l'RPC PredictTraffic via HTTP → Express :3001.
   * Se il server è offline lancia UNAVAILABLE.
   */
  async predictTraffic(request: Proto_TrafficRequest): Promise<GrpcCall<Proto_TrafficRequest, Proto_TrafficPrediction>> {
    const requestId = this.makeRequestId();
    const startTime = performance.now();
    this.totalCalls++;

    let status: GrpcStatusCode = 'OK';
    let response: Proto_TrafficPrediction | undefined;

    try {
      const res = await fetch('/api/grpc/predictTraffic', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-GRPC-Method': 'AIService/PredictTraffic',
          'X-Request-ID':  requestId,
        },
        body: JSON.stringify({
          zone:          request.zone,
          current_value: request.current_value,
          history:       request.history,
          hour:          request.hour,
          day_of_week:   request.day_of_week,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      response = await res.json() as Proto_TrafficPrediction;
    } catch (err) {
      status = 'UNAVAILABLE';
      aiLogger.error('gRPCStub', `PredictTraffic: server offline — ${err}`, { request_id: requestId });
    }

    const latencyMs = Math.round(performance.now() - startTime);

    grpcCallRegistry.record({
      id:        requestId,
      timestamp: Date.now(),
      service:   'AIService',
      method:    'PredictTraffic',
      status,
      latencyMs,
      request:   this.serialize({ zone: request.zone, current: request.current_value, hour: request.hour }),
      response:  this.serialize(response ?? { error: status }),
    });

    return {
      requestId,
      service:  this.serviceName,
      method:   'PredictTraffic',
      request,
      response,
      status,
      metadata: {
        'content-type':    'application/grpc+proto',
        'x-service-name':  this.serviceName,
        'x-request-id':    requestId,
      },
      startTime,
      endTime:   performance.now(),
      latencyMs,
    };
  }

  // ── Server-Streaming RPC: StreamAlerts ──────────────────────────
  /**
   * Nel proto: rpc StreamAlerts(StreamRequest) returns (stream Alert)
   * Simula un server-side stream gRPC.
   */
  streamAlerts(
    onData: (event: GrpcStreamEvent<{ zone: string; severity: string; message: string }>) => void,
    intervalMs = 3000
  ): () => void {
    aiLogger.info('gRPCStub', 'StreamAlerts: stream aperto', { endpoint: this.endpoint });

    const ZONES = ['Centro Storico', 'Zona Industriale', 'Zona Commerciale', 'Porto / Logistica'];
    const SEVERITIES = ['low', 'medium', 'high', 'critical'];

    const id = setInterval(() => {
      if (!this.connected) return;
      // Simula evento server-push
      const zone     = ZONES[Math.floor(Math.random() * ZONES.length)];
      const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];

      onData({
        type:      'data',
        data:      { zone, severity, message: `Alert generato da AI per ${zone}` },
        timestamp: Date.now(),
      });
    }, intervalMs);

    return () => {
      clearInterval(id);
      onData({ type: 'end', timestamp: Date.now() });
      aiLogger.info('gRPCStub', 'StreamAlerts: stream chiuso');
    };
  }

  // ── RPC: GetModelStatus ──────────────────────────────────────────
  async getModelStatus(): Promise<Proto_ModelStatus[]> {
    try {
      const res = await fetch('/api/grpc/modelStatus', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-GRPC-Method': 'AIService/GetModelStatus',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as Proto_ModelStatus[];
    } catch {
      // Server offline — ritorna array vuoto con flag
      this.connected = false;
      return [];
    }
  }

  isConnected(): boolean { return this.connected; }
  getTotalCalls(): number { return this.totalCalls; }

  disconnect() {
    this.connected = false;
    aiLogger.warn('gRPCStub', `Connessione a ${this.endpoint} chiusa`);
  }
}

// ============================================================
// AI SERVICE INTEGRATION — Collega simulator IoT → AI
// ============================================================

/**
 * Converte una SensorReading del simulatore IoT
 * nel formato Proto_SensorReading (come farebbe il DataProcessor via gRPC).
 */
export function sensorReadingToProto(reading: SensorReading): Proto_SensorReading {
  return {
    sensor_id: reading.sensorId,
    type:      reading.type,
    value:     reading.value,
    timestamp: reading.timestamp,
    zone:      reading.zone,
  };
}

// Singleton gRPC stub (come l'istanza del client nel DataProcessor)
export const aiServiceStub = new AIServiceStub();
