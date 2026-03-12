/**
 * SOAP Simulator — Client SOAP completo nel browser
 * ==================================================
 * Simula un client SOAP che comunica con il servizio Python/Spyne.
 * Genera VERI XML Envelope secondo lo standard SOAP 1.1,
 * simula la risposta XML del server e la parsa.
 *
 * In produzione il servizio SOAP gira su http://soap-service:8000
 * scritto in Python con la libreria Spyne, espone il WSDL su /wsdl
 *
 * @module SOAPSimulator
 */

// ============================================================
// WSDL — Web Services Description Language
// Il "contratto" del servizio, generato automaticamente da Spyne
// ============================================================

export const WSDL_DEFINITION = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  targetNamespace="http://smartcity.local/soap"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="http://smartcity.local/soap"
  name="SmartCitySOAPService">

  <!-- ╔══════════════════════════════╗ -->
  <!-- ║       TIPI DI DATI          ║ -->
  <!-- ╚══════════════════════════════╝ -->
  <wsdl:types>
    <xsd:schema targetNamespace="http://smartcity.local/soap">

      <!-- Request: Pagamento Multa -->
      <xsd:element name="PagamentoMultaRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="targa"       type="xsd:string"/>
            <xsd:element name="importo"     type="xsd:decimal"/>
            <xsd:element name="motivazione" type="xsd:string"/>
            <xsd:element name="operatore"   type="xsd:string" minOccurs="0"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <!-- Response: Pagamento Multa -->
      <xsd:element name="PagamentoMultaResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="transactionId" type="xsd:string"/>
            <xsd:element name="stato"         type="xsd:string"/>
            <xsd:element name="timestamp"     type="xsd:dateTime"/>
            <xsd:element name="ricevuta"      type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <!-- Request: Verifica Veicolo -->
      <xsd:element name="VerificaVeicoloRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="targa" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <!-- Response: Verifica Veicolo -->
      <xsd:element name="VerificaVeicoloResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="trovato"     type="xsd:boolean"/>
            <xsd:element name="proprietario" type="xsd:string" minOccurs="0"/>
            <xsd:element name="multeAperte" type="xsd:integer"/>
            <xsd:element name="totaleDebito" type="xsd:decimal"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <!-- Request: Report Zona -->
      <xsd:element name="ReportZonaRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="zona"     type="xsd:string"/>
            <xsd:element name="dataInizio" type="xsd:date"/>
            <xsd:element name="dataFine"   type="xsd:date"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

      <!-- Response: Report Zona -->
      <xsd:element name="ReportZonaResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="zona"          type="xsd:string"/>
            <xsd:element name="totalMulte"    type="xsd:integer"/>
            <xsd:element name="totaleIncassato" type="xsd:decimal"/>
            <xsd:element name="mediaGiornaliera" type="xsd:decimal"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>

    </xsd:schema>
  </wsdl:types>

  <!-- ╔══════════════════════════════╗ -->
  <!-- ║         MESSAGGI            ║ -->
  <!-- ╚══════════════════════════════╝ -->
  <wsdl:message name="PagamentoMultaIn">
    <wsdl:part name="parameters" element="tns:PagamentoMultaRequest"/>
  </wsdl:message>
  <wsdl:message name="PagamentoMultaOut">
    <wsdl:part name="parameters" element="tns:PagamentoMultaResponse"/>
  </wsdl:message>

  <wsdl:message name="VerificaVeicoloIn">
    <wsdl:part name="parameters" element="tns:VerificaVeicoloRequest"/>
  </wsdl:message>
  <wsdl:message name="VerificaVeicoloOut">
    <wsdl:part name="parameters" element="tns:VerificaVeicoloResponse"/>
  </wsdl:message>

  <wsdl:message name="ReportZonaIn">
    <wsdl:part name="parameters" element="tns:ReportZonaRequest"/>
  </wsdl:message>
  <wsdl:message name="ReportZonaOut">
    <wsdl:part name="parameters" element="tns:ReportZonaResponse"/>
  </wsdl:message>

  <!-- ╔══════════════════════════════╗ -->
  <!-- ║      PORT TYPE (interfaccia)║ -->
  <!-- ╚══════════════════════════════╝ -->
  <wsdl:portType name="SmartCityPortType">
    <wsdl:operation name="PagamentoMulta">
      <wsdl:input  message="tns:PagamentoMultaIn"/>
      <wsdl:output message="tns:PagamentoMultaOut"/>
    </wsdl:operation>
    <wsdl:operation name="VerificaVeicolo">
      <wsdl:input  message="tns:VerificaVeicoloIn"/>
      <wsdl:output message="tns:VerificaVeicoloOut"/>
    </wsdl:operation>
    <wsdl:operation name="ReportZona">
      <wsdl:input  message="tns:ReportZonaIn"/>
      <wsdl:output message="tns:ReportZonaOut"/>
    </wsdl:operation>
  </wsdl:portType>

  <!-- ╔══════════════════════════════╗ -->
  <!-- ║       BINDING (SOAP 1.1)    ║ -->
  <!-- ╚══════════════════════════════╝ -->
  <wsdl:binding name="SmartCitySOAPBinding" type="tns:SmartCityPortType">
    <soap:binding style="document"
      transport="http://schemas.xmlsoap.org/soap/http"/>

    <wsdl:operation name="PagamentoMulta">
      <soap:operation soapAction="http://smartcity.local/soap/PagamentoMulta"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>

    <wsdl:operation name="VerificaVeicolo">
      <soap:operation soapAction="http://smartcity.local/soap/VerificaVeicolo"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>

    <wsdl:operation name="ReportZona">
      <soap:operation soapAction="http://smartcity.local/soap/ReportZona"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>

  <!-- ╔══════════════════════════════╗ -->
  <!-- ║       SERVICE (endpoint)    ║ -->
  <!-- ╚══════════════════════════════╝ -->
  <wsdl:service name="SmartCitySOAPService">
    <wsdl:port name="SmartCitySOAPPort" binding="tns:SmartCitySOAPBinding">
      <soap:address location="http://soap-service:8000/soap"/>
    </wsdl:port>
  </wsdl:service>

</wsdl:definitions>`;

// ============================================================
// TIPI
// ============================================================

export type SOAPOperation = 'PagamentoMulta' | 'VerificaVeicolo' | 'ReportZona';

export interface SOAPCallLog {
  id:           string;
  timestamp:    number;
  operation:    SOAPOperation;
  requestXML:   string;
  responseXML:  string;
  parsedResponse: Record<string, unknown>;
  durationMs:   number;
  status:       'success' | 'fault';
  httpStatus:   number;
  soapAction:   string;
}

export interface PagamentoMultaParams {
  targa:       string;
  importo:     number;
  motivazione: string;
  operatore?:  string;
}

export interface VerificaVeicoloParams {
  targa: string;
}

export interface ReportZonaParams {
  zona:       string;
  dataInizio: string;
  dataFine:   string;
}

// ============================================================
// XML BUILDER — Genera SOAP Envelopes reali
// ============================================================

const NS = 'http://smartcity.local/soap';

function buildSOAPEnvelope(operation: SOAPOperation, body: string, token = 'city-internal-token-2024'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="${NS}">
  <soap:Header>
    <tns:AuthToken>${token}</tns:AuthToken>
    <tns:RequestId>${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}</tns:RequestId>
    <tns:Timestamp>${new Date().toISOString()}</tns:Timestamp>
  </soap:Header>
  <soap:Body>
    <tns:${operation}>
${body}    </tns:${operation}>
  </soap:Body>
</soap:Envelope>`;
}

function buildResponseEnvelope(operation: SOAPOperation, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="${NS}">
  <soap:Header>
    <tns:ProcessedBy>soap-service:8000 (Python/Spyne 2.14)</tns:ProcessedBy>
    <tns:ResponseTimestamp>${new Date().toISOString()}</tns:ResponseTimestamp>
  </soap:Header>
  <soap:Body>
    <tns:${operation}Response>
${body}    </tns:${operation}Response>
  </soap:Body>
</soap:Envelope>`;
}

function buildFaultEnvelope(code: string, message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:${code}</faultcode>
      <faultstring>${message}</faultstring>
      <detail>
        <errorCode>SMART_CITY_ERR_001</errorCode>
        <service>soap-service:8000</service>
      </detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

// Parser XML leggero — estrae valori da tag
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:tns:)?${tag}[^>]*>([^<]*)<\/(?:tns:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

// ============================================================
// CALL LOG REGISTRY
// ============================================================

class SOAPCallRegistry {
  private logs: SOAPCallLog[] = [];
  private listeners: Set<(log: SOAPCallLog) => void> = new Set();

  record(log: SOAPCallLog) {
    this.logs.unshift(log);
    if (this.logs.length > 100) this.logs.pop();
    this.listeners.forEach(l => l(log));
  }

  subscribe(fn: (log: SOAPCallLog) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getLogs(): SOAPCallLog[] { return [...this.logs]; }
  clear() { this.logs = []; }
}

export const soapCallRegistry = new SOAPCallRegistry();

// ============================================================
// SOAP CLIENT
// ============================================================

export class SOAPClient {
  private readonly endpoint = 'http://soap-service:8000/soap';
  private readonly namespace = NS;

  private makeId(): string {
    return `soap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ── PagamentoMulta ────────────────────────────────────────────
  // ── helper: invia l'envelope XML a Express e gestisce la risposta ─
  private async _callServer(
    operation: string,
    requestXML: string,
    soapAction: string,
    start: number
  ): Promise<SOAPCallLog> {
    let responseXML = '';
    let parsedResponse: Record<string, unknown> = {};
    let status: 'success' | 'fault' = 'fault';
    let httpStatus = 0;

    try {
      const res = await fetch('/api/soap', {
        method:  'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction':   `"${soapAction}"`,
        },
        body: requestXML,
      });

      httpStatus  = res.status;
      responseXML = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      status = responseXML.includes('soap:Fault') ? 'fault' : 'success';
      parsedResponse = this.parseResponseXML(responseXML);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      responseXML = buildFaultEnvelope('Server', `Server Express non raggiungibile: ${msg}`);
      parsedResponse = { fault: 'Server', message: `Server offline — avvia Express con: npx tsx server/index.ts` };
      status = 'fault';
      httpStatus = 0;
    }

    const log: SOAPCallLog = {
      id:             this.makeId(),
      timestamp:      Date.now(),
      operation,
      requestXML,
      responseXML,
      parsedResponse,
      durationMs:     Math.round(performance.now() - start),
      status,
      httpStatus,
      soapAction,
    };
    soapCallRegistry.record(log);
    return log;
  }

  async pagamentoMulta(params: PagamentoMultaParams): Promise<SOAPCallLog> {
    const start      = performance.now();
    const soapAction = `${this.namespace}/PagamentoMulta`;
    const requestXML = buildSOAPEnvelope('PagamentoMulta', `
      <tns:targa>${params.targa}</tns:targa>
      <tns:importo>${params.importo.toFixed(2)}</tns:importo>
      <tns:motivazione>${params.motivazione}</tns:motivazione>
      <tns:operatore>${params.operatore || 'SISTEMA'}</tns:operatore>`);

    return this._callServer('PagamentoMulta', requestXML, soapAction, start);
  }

  async verificaVeicolo(params: VerificaVeicoloParams): Promise<SOAPCallLog> {
    const start      = performance.now();
    const soapAction = `${this.namespace}/VerificaVeicolo`;
    const requestXML = buildSOAPEnvelope('VerificaVeicolo', `
      <tns:targa>${params.targa}</tns:targa>`);

    return this._callServer('VerificaVeicolo', requestXML, soapAction, start);
  }

  async reportZona(params: ReportZonaParams): Promise<SOAPCallLog> {
    const start      = performance.now();
    const soapAction = `${this.namespace}/ReportZona`;
    const requestXML = buildSOAPEnvelope('ReportZona', `
      <tns:zona>${params.zona}</tns:zona>
      <tns:dataInizio>${params.dataInizio}</tns:dataInizio>
      <tns:dataFine>${params.dataFine}</tns:dataFine>`);

    return this._callServer('ReportZona', requestXML, soapAction, start);
  }

  getEndpoint(): string { return this.endpoint; }

  // Helper per estrarre dati dalla risposta XML
  parseResponseXML(xml: string): Record<string, string> {
    const tags = xml.match(/<(?:tns:)?\w+>[^<]+<\/(?:tns:)?\w+>/g) || [];
    const result: Record<string, string> = {};
    tags.forEach(tag => {
      const name = extractTag(tag, '(\\w+)');
      if (name) result[name] = extractTag(xml, name);
    });
    return result;
  }
}

// ============================================================
// ESEMPI PRECONFIGURATI
// ============================================================

export const SOAP_EXAMPLES = {
  PagamentoMulta: [
    { targa: 'AB123CD', importo: 87.50,  motivazione: 'Sosta in zona vietata',           operatore: 'AGT-042' },
    { targa: 'XY789ZZ', importo: 41.00,  motivazione: 'Mancato rispetto segnaletica',    operatore: 'AGT-015' },
    { targa: 'MM456NN', importo: 173.00, motivazione: 'Divieto di sosta su passaggio pedonale', operatore: 'AGT-007' },
  ],
  VerificaVeicolo: [
    { targa: 'AB123CD' },
    { targa: 'XY789ZZ' },
    { targa: 'MM456NN' },
    { targa: 'INVALIDO' },
  ],
  ReportZona: [
    { zona: 'Centro Storico',    dataInizio: '2024-01-01', dataFine: '2024-01-31' },
    { zona: 'Zona Commerciale',  dataInizio: '2024-01-01', dataFine: '2024-01-31' },
    { zona: 'Zona Industriale',  dataInizio: '2024-01-01', dataFine: '2024-01-31' },
  ],
};

export const soapClient = new SOAPClient();
