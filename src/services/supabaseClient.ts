/**
 * supabaseClient.ts — Client Supabase per PuntoSnai Smart City
 *
 * Supabase è un Backend-as-a-Service open-source che espone un database
 * PostgreSQL reale tramite API REST (PostgREST) e WebSocket (Realtime).
 *
 * Ogni chiamata qui è una vera richiesta HTTP verso il server Supabase
 * in Europa (eu-west-1). I dati vengono persistiti in PostgreSQL reale.
 *
 * Endpoint: https://hqekyxrmswdxgpdruiap.supabase.co
 * Auth: anon key (sicura per il frontend — Row Level Security gestisce i permessi)
 *
 * Come verificare i dati scritti:
 *   → Apri https://supabase.com/dashboard
 *   → Progetto: hqekyxrmswdxgpdruiap
 *   → Table Editor → readings / alerts
 *   → Vedrai le righe inserite in tempo reale
 */

import { createClient } from '@supabase/supabase-js';

// ─── Configurazione ────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://hqekyxrmswdxgpdruiap.supabase.co';

/**
 * Anon Key — sicura per il browser.
 * È una chiave JWT con ruolo "anon" — può solo fare ciò che
 * le Row Level Security policies permettono (INSERT su readings/alerts).
 * NON è la service_role key (quella non va mai nel frontend).
 */
const SUPABASE_ANON_KEY = 'sb_publishable_GmbuIdt9MrrnboCCLV0pGA_PNFjTdto';

// Singleton client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Nessuna autenticazione utente — usiamo solo il ruolo "anon"
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Application': 'puntosnai-smart-city',
      'X-Version': '1.0.0',
    },
  },
});

// ─── Tipi che mappano esattamente le colonne SQL ───────────────────────────────

export interface SupabaseReading {
  id: string;
  sensor_id: string;
  sensor_type: string;     // 'traffic' | 'air_quality' | 'temperature' | 'noise' | 'energy'
  value: number;
  unit: string;
  zone_name: string;
  status: string;          // 'normal' | 'warning' | 'critical'
  anomaly_score: number;   // 0.0 – 1.0
  created_at?: string;     // auto-generato da Supabase (timestamptz)
}

export interface SupabaseAlert {
  id: string;
  sensor_id: string;
  sensor_type: string;
  severity: string;        // 'low' | 'medium' | 'high' | 'critical'
  message: string;
  zone_name: string;
  acknowledged: boolean;
  created_at?: string;
}

export interface SupabaseGrpcCall {
  id: string;
  method_name: string;     // 'DetectAnomaly' | 'PredictTraffic' | 'StreamAlerts'
  sensor_type: string;
  zone_name: string;
  latency_ms: number;
  status_code: string;     // 'OK' | 'INTERNAL' | etc.
  anomaly_detected: boolean;
  anomaly_score: number;
  predicted_value: number | null;
  created_at?: string;
}

// ─── Risposta log POST HTTP ────────────────────────────────────────────────────

export interface PostResult {
  success: boolean;
  rowsInserted: number;
  latencyMs: number;
  error?: string;
  endpoint: string;
}
