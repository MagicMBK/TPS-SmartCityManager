/**
 * indexedDBStore.ts — Storage persistente REALE nel browser
 *
 * IndexedDB è un database NoSQL integrato in ogni browser moderno.
 * I dati persistono tra sessioni (sopravvivono al refresh della pagina).
 * Nessun server richiesto — è il "database locale" del browser.
 *
 * Cosa è REALE qui:
 *   - indexedDB.open() apre un vero database binario nel filesystem del browser
 *   - Ogni insertReading() è una vera transazione ACID con commit
 *   - I dati sopravvivono al refresh — puoi verificarlo in DevTools → Application → IndexedDB
 *   - getRecentReadings() usa un vero cursore IDB in ordine decrescente per timestamp
 *   - pruneStore() usa un cursore ascendente per eliminare i record più vecchi
 *
 * Schema (equivalente SQL):
 *   DB: "puntosnai_smartcity" (v1)
 *
 *   CREATE TABLE readings (
 *     id        TEXT PRIMARY KEY,
 *     time      TIMESTAMPTZ NOT NULL,
 *     sensor_id TEXT NOT NULL,
 *     type      TEXT NOT NULL,
 *     value     NUMERIC NOT NULL,
 *     unit      TEXT,
 *     zone      TEXT,
 *     status    TEXT,
 *     session   TEXT
 *   );
 *   CREATE INDEX readings_by_time    ON readings (time DESC);
 *   CREATE INDEX readings_by_type    ON readings (type);
 *   CREATE INDEX readings_by_zone    ON readings (zone);
 *   CREATE INDEX readings_by_session ON readings (session);
 *
 *   CREATE TABLE alerts (
 *     id       TEXT PRIMARY KEY,
 *     time     TIMESTAMPTZ NOT NULL,
 *     severity TEXT NOT NULL,
 *     message  TEXT,
 *     zone     TEXT,
 *     ack      BOOLEAN DEFAULT FALSE,
 *     session  TEXT
 *   );
 *   CREATE INDEX alerts_by_time     ON alerts (time DESC);
 *   CREATE INDEX alerts_by_severity ON alerts (severity);
 *
 * Verifica in DevTools:
 *   F12 → Application → Storage → IndexedDB → puntosnai_smartcity
 */

import type { SensorReading } from '../data/sensorSimulator';

const DB_NAME    = 'puntosnai_smartcity';
const DB_VERSION = 1;

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface StoredReading {
  id: string;
  time: string;        // ISO timestamp — es. "2024-01-15T14:32:00.000Z"
  sensor_id: string;
  type: string;
  value: number;
  unit: string;
  zone: string;
  status: string;
  session: string;     // UUID della sessione corrente
}

export interface StoredAlert {
  id: string;
  time: string;
  severity: string;
  message: string;
  zone: string;
  ack: boolean;
  session: string;
}

// ─── DB Manager ───────────────────────────────────────────────────────────────

class IndexedDBStore {
  private db: IDBDatabase | null = null;
  private ready = false;
  private queue: (() => void)[] = [];
  private sessionId: string;
  private listeners: Set<(event: 'reading' | 'alert') => void> = new Set();

  private writeCount = 0;
  private errorCount = 0;

  constructor() {
    this.sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.init();
  }

  private init() {
    if (!window.indexedDB) {
      console.warn('[IndexedDB] Non supportato in questo browser.');
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Object store "readings"
      if (!db.objectStoreNames.contains('readings')) {
        const store = db.createObjectStore('readings', { keyPath: 'id' });
        store.createIndex('by_time',    'time',    { unique: false });
        store.createIndex('by_type',    'type',    { unique: false });
        store.createIndex('by_zone',    'zone',    { unique: false });
        store.createIndex('by_session', 'session', { unique: false });
      }

      // Object store "alerts"
      if (!db.objectStoreNames.contains('alerts')) {
        const store = db.createObjectStore('alerts', { keyPath: 'id' });
        store.createIndex('by_time',     'time',     { unique: false });
        store.createIndex('by_severity', 'severity', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      this.db = (event.target as IDBOpenDBRequest).result;
      this.ready = true;
      this.queue.forEach(fn => fn());
      this.queue = [];
    };

    request.onerror = () => {
      console.error('[IndexedDB] Errore apertura:', request.error);
      this.errorCount++;
    };
  }

  private whenReady(fn: () => void) {
    if (this.ready && this.db) fn();
    else this.queue.push(fn);
  }

  // ─── INSERT reading ──────────────────────────────────────────────────────────

  insertReading(reading: SensorReading): void {
    this.whenReady(() => {
      if (!this.db) return;
      const tx = this.db.transaction('readings', 'readwrite');
      const store = tx.objectStore('readings');
      const record: StoredReading = {
        id:        reading.id,
        time:      new Date(reading.timestamp).toISOString(),
        sensor_id: reading.sensorId,
        type:      reading.type,
        value:     reading.value,
        unit:      reading.unit,
        zone:      reading.zone,
        status:    reading.status,
        session:   this.sessionId,
      };
      const req = store.add(record);
      req.onsuccess = () => {
        this.writeCount++;
        this.notify('reading');
      };
      req.onerror = () => { /* duplicato — skip silenzioso */ };

      // Mantiene max 2000 record (TimescaleDB chunk policy equivalente)
      this.pruneStore('readings', 2000);
    });
  }

  // ─── INSERT alert ────────────────────────────────────────────────────────────

  insertAlert(alert: { id: string; severity: string; message: string; zone: string; timestamp: number }): void {
    this.whenReady(() => {
      if (!this.db) return;
      const tx = this.db.transaction('alerts', 'readwrite');
      const store = tx.objectStore('alerts');
      const record: StoredAlert = {
        id:       alert.id,
        time:     new Date(alert.timestamp).toISOString(),
        severity: alert.severity,
        message:  alert.message,
        zone:     alert.zone,
        ack:      false,
        session:  this.sessionId,
      };
      store.add(record);
      this.notify('alert');
    });
  }

  // ─── SELECT readings (ultimi N, ordine decrescente per time) ────────────────

  getRecentReadings(limit = 50): Promise<StoredReading[]> {
    return new Promise((resolve) => {
      this.whenReady(() => {
        if (!this.db) { resolve([]); return; }
        const tx    = this.db.transaction('readings', 'readonly');
        const store = tx.objectStore('readings');
        const idx   = store.index('by_time');
        const results: StoredReading[] = [];

        const req = idx.openCursor(null, 'prev'); // DESC — più recenti prima
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value as StoredReading);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    });
  }

  // ─── SELECT alerts (ultimi N) ────────────────────────────────────────────────

  getRecentAlerts(limit = 20): Promise<StoredAlert[]> {
    return new Promise((resolve) => {
      this.whenReady(() => {
        if (!this.db) { resolve([]); return; }
        const tx    = this.db.transaction('alerts', 'readonly');
        const store = tx.objectStore('alerts');
        const idx   = store.index('by_time');
        const results: StoredAlert[] = [];

        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value as StoredAlert);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
      });
    });
  }

  // ─── COUNT totale records ────────────────────────────────────────────────────

  getCount(): Promise<{ readings: number; alerts: number }> {
    return new Promise((resolve) => {
      this.whenReady(() => {
        if (!this.db) { resolve({ readings: 0, alerts: 0 }); return; }
        const tx = this.db.transaction(['readings', 'alerts'], 'readonly');
        const r1 = tx.objectStore('readings').count();
        const r2 = tx.objectStore('alerts').count();
        let readings = 0, alerts = 0, done = 0;
        const check = () => { if (++done === 2) resolve({ readings, alerts }); };
        r1.onsuccess = () => { readings = r1.result; check(); };
        r2.onsuccess = () => { alerts  = r2.result; check(); };
      });
    });
  }

  // ─── PRUNE: elimina i più vecchi se > maxCount ──────────────────────────────
  // Equivalente a TimescaleDB chunk retention policy

  private pruneStore(storeName: string, maxCount: number): void {
    if (!this.db) return;
    const tx       = this.db.transaction(storeName, 'readwrite');
    const store    = tx.objectStore(storeName);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total > maxCount) {
        const toDelete = total - maxCount;
        const idx = store.index('by_time');
        const req = idx.openCursor(); // ASC — più vecchi prima
        let deleted = 0;
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };
  }

  // ─── CLEAR sessione corrente ─────────────────────────────────────────────────

  clearSession(): void {
    this.whenReady(() => {
      if (!this.db) return;
      const tx    = this.db.transaction('readings', 'readwrite');
      const store = tx.objectStore('readings');
      const idx   = store.index('by_session');
      const req   = idx.openCursor(IDBKeyRange.only(this.sessionId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    });
  }

  // ─── Observer ────────────────────────────────────────────────────────────────

  subscribe(fn: (event: 'reading' | 'alert') => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(event: 'reading' | 'alert') {
    this.listeners.forEach(fn => fn(event));
  }

  // ─── Statistiche pubbliche ───────────────────────────────────────────────────

  getStats() {
    return {
      sessionId:  this.sessionId,
      writeCount: this.writeCount,
      errorCount: this.errorCount,
      isReady:    this.ready,
    };
  }

  getSessionId() { return this.sessionId; }
}

// Singleton — una sola istanza per tutta l'app
export const idbStore = new IndexedDBStore();
