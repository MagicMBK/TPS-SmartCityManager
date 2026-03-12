/**
 * SOAP Routes — Server SOAP reale HTTP
 * Persistenza in-memory: le multe pagate restano nel DB del server.
 * VerificaVeicolo trova le multe reali registrate in sessione.
 * ReportZona legge dati aggregati reali da Supabase.
 */

import { Router, Request, Response } from 'express';

export const soapRouter = Router();

const NS = 'http://smartcity.local/soap';

// ── Database in-memory delle multe (persiste finché Express è attivo) ────────
interface MultaRecord {
  transactionId: string;
  targa:         string;
  importo:       number;
  motivazione:   string;
  operatore:     string;
  ricevuta:      string;
  timestamp:     string;
  stato:         'PAGATO';
}

const multeDB = new Map<string, MultaRecord[]>(); // targa → multa[]
let totalMulteCount = 0;
let totalIncassato  = 0;

// ── Supabase config per ReportZona ───────────────────────────────────────────
const SUPABASE_URL     = 'https://hqekyxrmswdxgpdruiap.supabase.co';
const SUPABASE_API_KEY = 'sb_publishable_GmbuIdt9MrrnboCCLV0pGA_PNFjTdto';

async function fetchZoneMetrics(zona: string): Promise<{
  traffico: number; qualitaAria: number; temperatura: number;
  rumore: number; energia: number; alertAttivi: number;
}> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/readings?select=sensor_type,value&zone_name=eq.${encodeURIComponent(zona)}&order=created_at.desc&limit=100`,
      { headers: { apikey: SUPABASE_API_KEY, Authorization: `Bearer ${SUPABASE_API_KEY}` } }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json() as { sensor_type: string; value: number }[];

    const avg = (type: string) => {
      const vals = rows.filter(r => r.sensor_type === type).map(r => r.value);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
    };

    const alertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/alerts?select=id&zone_name=eq.${encodeURIComponent(zona)}&acknowledged=eq.false`,
      { headers: { apikey: SUPABASE_API_KEY, Authorization: `Bearer ${SUPABASE_API_KEY}` } }
    );
    const alertRows = alertRes.ok ? await alertRes.json() as unknown[] : [];

    return {
      traffico:    avg('traffic'),
      qualitaAria: avg('air_quality'),
      temperatura: avg('temperature'),
      rumore:      avg('noise'),
      energia:     avg('energy'),
      alertAttivi: alertRows.length,
    };
  } catch {
    // Fallback se Supabase non risponde
    return { traffico: 0, qualitaAria: 0, temperatura: 0, rumore: 0, energia: 0, alertAttivi: 0 };
  }
}

// ── XML builders ─────────────────────────────────────────────────────────────

function soapResponse(operation: string, bodyContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="${NS}">
  <soap:Header>
    <tns:ServerTimestamp>${new Date().toISOString()}</tns:ServerTimestamp>
    <tns:ProcessedBy>puntosnai-soap-server-local</tns:ProcessedBy>
    <tns:TotalMulteDB>${totalMulteCount}</tns:TotalMulteDB>
  </soap:Header>
  <soap:Body>
    <tns:${operation}Response>
${bodyContent}
    </tns:${operation}Response>
  </soap:Body>
</soap:Envelope>`;
}

function soapFault(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>${code}</faultcode>
      <faultstring>${message}</faultstring>
      <detail><timestamp>${new Date().toISOString()}</timestamp></detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function extractField(xml: string, field: string): string {
  const re = new RegExp(`<(?:tns:)?${field}[^>]*>([^<]*)<\\/(?:tns:)?${field}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
}

function detectOperation(xml: string, soapAction?: string): string {
  if (soapAction?.includes('PagamentoMulta') || xml.includes('PagamentoMulta'))   return 'PagamentoMulta';
  if (soapAction?.includes('VerificaVeicolo') || xml.includes('VerificaVeicolo')) return 'VerificaVeicolo';
  if (soapAction?.includes('ReportZona') || xml.includes('ReportZona'))            return 'ReportZona';
  return '';
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function handlePagamentoMulta(xml: string): string {
  const targa       = extractField(xml, 'targa');
  const importoStr  = extractField(xml, 'importo');
  const motivazione = extractField(xml, 'motivazione') || 'Non specificata';
  const operatore   = extractField(xml, 'operatore')   || 'SISTEMA';
  const importo     = parseFloat(importoStr);

  if (!targa || targa.length < 4)
    return soapFault('Client', `Targa non valida: "${targa}"`);
  if (isNaN(importo) || importo <= 0)
    return soapFault('Client', `Importo non valido: "${importoStr}"`);

  // Registra nel DB in-memory
  const txId     = `TXN-${Date.now().toString(36).toUpperCase()}-${targa}`;
  const ricevuta = `RIC-${targa}-${Date.now().toString().slice(-6)}`;
  const record: MultaRecord = {
    transactionId: txId, targa, importo, motivazione,
    operatore, ricevuta, timestamp: new Date().toISOString(), stato: 'PAGATO',
  };

  if (!multeDB.has(targa)) multeDB.set(targa, []);
  multeDB.get(targa)!.push(record);
  totalMulteCount++;
  totalIncassato += importo;

  return soapResponse('PagamentoMulta', `
      <tns:transactionId>${txId}</tns:transactionId>
      <tns:stato>PAGATO</tns:stato>
      <tns:targa>${targa}</tns:targa>
      <tns:importo>${importo.toFixed(2)}</tns:importo>
      <tns:motivazione>${motivazione}</tns:motivazione>
      <tns:operatore>${operatore}</tns:operatore>
      <tns:ricevuta>${ricevuta}</tns:ricevuta>
      <tns:totalMulteDB>${totalMulteCount}</tns:totalMulteDB>
      <tns:timestamp>${new Date().toISOString()}</tns:timestamp>`);
}

function handleVerificaVeicolo(xml: string): string {
  const targa = extractField(xml, 'targa');

  if (!targa || targa.length < 4)
    return soapFault('Client', `Targa non valida: "${targa}"`);

  // Legge le multe REALI dal DB in-memory
  const multe = multeDB.get(targa) ?? [];
  const multeAperte = multe.length;
  const totalDebito = multe.reduce((s, m) => s + m.importo, 0);

  // Storico ultime 3 multe
  const storicoXml = multe.slice(-3).map(m =>
    `<tns:multa><tns:id>${m.transactionId}</tns:id><tns:importo>${m.importo.toFixed(2)}</tns:importo><tns:data>${m.timestamp.slice(0, 10)}</tns:data></tns:multa>`
  ).join('\n      ');

  return soapResponse('VerificaVeicolo', `
      <tns:targa>${targa}</tns:targa>
      <tns:stato>${multeAperte === 0 ? 'REGOLARE' : 'PENDENZE_APERTE'}</tns:stato>
      <tns:multeAperte>${multeAperte}</tns:multeAperte>
      <tns:totaleDebito>${totalDebito.toFixed(2)}</tns:totaleDebito>
      <tns:storico>${storicoXml || '<tns:nessuna/>'}</tns:storico>
      <tns:timestamp>${new Date().toISOString()}</tns:timestamp>`);
}

async function handleReportZona(xml: string): Promise<string> {
  const zona = extractField(xml, 'zona') || extractField(xml, 'zone') || 'Centro Storico';

  // Legge dati REALI da Supabase
  const metrics = await fetchZoneMetrics(zona);

  // Conta le multe pagate in questa zona (dal DB in-memory)
  let multeZona = 0;
  let incassatoZona = 0;
  for (const [, records] of multeDB) {
    for (const r of records) {
      // Non abbiamo la zona nella multa, ma contiamo tutte per ora
      multeZona++;
      incassatoZona += r.importo;
    }
  }

  return soapResponse('ReportZona', `
      <tns:zona>${zona}</tns:zona>
      <tns:traffico>${metrics.traffico}</tns:traffico>
      <tns:qualitaAria>${metrics.qualitaAria}</tns:qualitaAria>
      <tns:temperatura>${metrics.temperatura}</tns:temperatura>
      <tns:rumore>${metrics.rumore}</tns:rumore>
      <tns:energia>${metrics.energia}</tns:energia>
      <tns:alertAttivi>${metrics.alertAttivi}</tns:alertAttivi>
      <tns:multeRegistrateDB>${multeZona}</tns:multeRegistrateDB>
      <tns:incassatoTotaleDB>${incassatoZona.toFixed(2)}</tns:incassatoTotaleDB>
      <tns:fonteMetriche>Supabase PostgreSQL</tns:fonteMetriche>
      <tns:timestamp>${new Date().toISOString()}</tns:timestamp>`);
}

// ── POST /soap ────────────────────────────────────────────────────────────────

soapRouter.post('/', async (req: Request, res: Response) => {
  const soapAction = (req.headers['soapaction'] as string)?.replace(/"/g, '') ?? '';
  const body       = req.body as string;

  if (!body || typeof body !== 'string') {
    res.status(400).type('text/xml').send(soapFault('Client', 'Empty or invalid body'));
    return;
  }

  // Risponde anche a ping di health-check
  if (!body.includes('soap:Envelope')) {
    res.status(200).type('text/xml').send('<pong/>');
    return;
  }

  const operation = detectOperation(body, soapAction);
  if (!operation) {
    res.status(400).type('text/xml').send(soapFault('Client', `Unknown SOAPAction: ${soapAction}`));
    return;
  }

  let responseXml: string;
  switch (operation) {
    case 'PagamentoMulta':
      responseXml = handlePagamentoMulta(body);
      break;
    case 'VerificaVeicolo':
      responseXml = handleVerificaVeicolo(body);
      break;
    case 'ReportZona':
      responseXml = await handleReportZona(body);
      break;
    default:
      responseXml = soapFault('Server', `Not implemented: ${operation}`);
  }

  res.type('text/xml').send(responseXml);
});

// ── GET /soap?wsdl ────────────────────────────────────────────────────────────
soapRouter.get('/', (req: Request, res: Response) => {
  if ('wsdl' in req.query) {
    res.type('text/xml').send(`<?xml version="1.0"?><wsdl:definitions name="SmartCityService" targetNamespace="${NS}" xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"><wsdl:service name="SmartCityService"><wsdl:port name="SmartCityPort"><soap:address location="http://localhost:3001/soap" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"/></wsdl:port></wsdl:service></wsdl:definitions>`);
  } else {
    res.json({
      message: 'PuntoSnai SOAP — DB multe in-memory, metriche da Supabase',
      totalMulteRegistrate: totalMulteCount,
      totalIncassato: totalIncassato.toFixed(2),
    });
  }
});
