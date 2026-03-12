/**
 * MQTT Routes — Simula broker MQTT via HTTP (pattern MQTT-over-HTTP)
 * In produzione sarebbe Eclipse Mosquitto su TCP 1883.
 * Il browser non supporta TCP raw, quindi usiamo HTTP come trasporto.
 *
 * Endpoints:
 *   POST /mqtt/publish   → pubblica un messaggio su un topic
 *   GET  /mqtt/subscribe → polling dei messaggi recenti per topic
 *   GET  /mqtt/topics    → lista topic attivi
 */

import { Router } from 'express';

export const mqttRouter = Router();

// In-memory message broker
interface MqttMessage {
  id:        string;
  topic:     string;
  payload:   unknown;
  qos:       0 | 1 | 2;
  retain:    boolean;
  timestamp: string;
  clientId:  string;
}

const messageStore: MqttMessage[] = [];
const MAX_MESSAGES = 500;

// Topic attivi nel sistema
const VALID_TOPICS = [
  'smartcity/sensors/traffic',
  'smartcity/sensors/air_quality',
  'smartcity/sensors/temperature',
  'smartcity/sensors/noise',
  'smartcity/sensors/energy',
  'smartcity/alerts/critical',
  'smartcity/alerts/warning',
  'smartcity/zones/+/status',
  'smartcity/system/heartbeat',
];

function matchTopic(pattern: string, topic: string): boolean {
  // MQTT wildcard: + (un livello), # (tutti i livelli successivi)
  const regexStr = pattern
    .replace(/\+/g, '[^/]+')
    .replace(/#/g, '.*');
  return new RegExp(`^${regexStr}$`).test(topic);
}

// ── POST /mqtt/publish ───────────────────────────────────────────────────────

mqttRouter.post('/publish', (req, res) => {
  const { topic, payload, qos = 0, retain = false, clientId = 'puntosnai-browser' } = req.body as {
    topic:     string;
    payload:   unknown;
    qos?:      0 | 1 | 2;
    retain?:   boolean;
    clientId?: string;
  };

  if (!topic || payload === undefined) {
    return res.status(400).json({
      error:   'MQTT_PUBLISH_FAILED',
      message: 'Missing required fields: topic, payload',
      code:    'CONNACK_REFUSED_PROTOCOL',
    });
  }

  const message: MqttMessage = {
    id:        `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    topic,
    payload,
    qos:       qos as 0 | 1 | 2,
    retain,
    timestamp: new Date().toISOString(),
    clientId,
  };

  messageStore.unshift(message);
  if (messageStore.length > MAX_MESSAGES) messageStore.pop();

  // MQTT QoS 0: fire and forget (risponde subito)
  // MQTT QoS 1: at least once (simula PUBACK)
  // MQTT QoS 2: exactly once (simula PUBREC/PUBREL/PUBCOMP)
  const latency = qos === 0 ? 1 : qos === 1 ? 3 + Math.random() * 5 : 8 + Math.random() * 12;

  setTimeout(() => {
    res.json({
      status:     'PUBLISHED',
      messageId:  message.id,
      topic,
      qos,
      retain,
      brokerTime: message.timestamp,
      packetId:   qos > 0 ? Math.floor(Math.random() * 65535) : null,
      // PUBACK/PUBREC response code
      reasonCode: 0,   // 0x00 = Success
    });
  }, latency);
});

// ── GET /mqtt/subscribe ──────────────────────────────────────────────────────
// Polling dei messaggi per topic (simula long-poll MQTT subscription)

mqttRouter.get('/subscribe', (req, res) => {
  const topic  = (req.query.topic as string) ?? 'smartcity/#';
  const limit  = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const since  = req.query.since as string; // ISO timestamp

  const filtered = messageStore
    .filter(m => matchTopic(topic, m.topic))
    .filter(m => since ? m.timestamp > since : true)
    .slice(0, limit);

  res.json({
    topic,
    messages:  filtered,
    count:     filtered.length,
    broker:    'puntosnai-mqtt-local:1883',
    queueSize: messageStore.length,
    timestamp: new Date().toISOString(),
  });
});

// ── GET /mqtt/topics ─────────────────────────────────────────────────────────

mqttRouter.get('/topics', (_req, res) => {
  const topicStats = VALID_TOPICS.map(topic => ({
    topic,
    messageCount: messageStore.filter(m => matchTopic(topic, m.topic)).length,
    lastMessage:  messageStore.find(m => matchTopic(topic, m.topic))?.timestamp ?? null,
  }));

  res.json({
    broker:     'puntosnai-mqtt-local:1883',
    topics:     topicStats,
    totalMessages: messageStore.length,
    timestamp:  new Date().toISOString(),
  });
});

// ── GET /mqtt/health ─────────────────────────────────────────────────────────

mqttRouter.get('/health', (_req, res) => {
  res.json({
    status:      'CONNECTED',
    broker:      'mosquitto@localhost:1883',
    protocol:    'MQTT 5.0',
    transport:   'HTTP-over-MQTT (browser compatibility)',
    uptime:      process.uptime(),
    clients:     1,
    timestamp:   new Date().toISOString(),
  });
});