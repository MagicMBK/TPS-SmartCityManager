/**
 * Dettaglio Zona — Pannello laterale con info sulla zona selezionata
 */
import type { ZoneData, SensorReading } from '../data/sensorSimulator';
import { predictTraffic } from '../data/sensorSimulator';

interface ZoneDetailProps {
  zone: ZoneData;
  readings: SensorReading[];
  onClose: () => void;
}

function getQualityLabel(value: number, type: string): { label: string; color: string } {
  if (type === 'airQuality') {
    if (value > 75) return { label: 'Buona', color: 'text-green-400' };
    if (value > 50) return { label: 'Moderata', color: 'text-yellow-400' };
    if (value > 30) return { label: 'Scarsa', color: 'text-orange-400' };
    return { label: 'Pessima', color: 'text-red-400' };
  }
  if (type === 'traffic') {
    if (value < 30) return { label: 'Scorrevole', color: 'text-green-400' };
    if (value < 60) return { label: 'Moderato', color: 'text-yellow-400' };
    if (value < 80) return { label: 'Intenso', color: 'text-orange-400' };
    return { label: 'Congestionato', color: 'text-red-400' };
  }
  return { label: 'Normale', color: 'text-gray-400' };
}

export default function ZoneDetail({ zone, readings, onClose }: ZoneDetailProps) {
  const zoneReadings = readings.filter(r => r.zone === zone.name).slice(0, 10);

  const now = new Date();
  const trafficPrediction = predictTraffic(now.getHours(), now.getDay(), zone.traffic);
  const trafficQuality = getQualityLabel(zone.traffic, 'traffic');
  const airQuality = getQualityLabel(zone.airQuality, 'airQuality');

  return (
    <div className="bg-gray-800/80 backdrop-blur-md rounded-xl p-4 border border-gray-700/50 animate-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          📍 {zone.name}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetricCard
          icon="🚗"
          label="Traffico"
          value={`${Math.round(zone.traffic)}`}
          unit="idx"
          quality={trafficQuality}
        />
        <MetricCard
          icon="🌿"
          label="Qualità Aria"
          value={`${Math.round(zone.airQuality)}`}
          unit="AQI"
          quality={airQuality}
        />
        <MetricCard
          icon="🌡️"
          label="Temperatura"
          value={`${zone.temperature.toFixed(1)}`}
          unit="°C"
          quality={{ label: zone.temperature > 35 ? 'Alta' : zone.temperature < 20 ? 'Bassa' : 'Normale', color: zone.temperature > 35 ? 'text-red-400' : 'text-green-400' }}
        />
        <MetricCard
          icon="🔊"
          label="Rumore"
          value={`${Math.round(zone.noise)}`}
          unit="dB"
          quality={{ label: zone.noise > 70 ? 'Elevato' : 'Normale', color: zone.noise > 70 ? 'text-orange-400' : 'text-green-400' }}
        />
        <MetricCard
          icon="⚡"
          label="Energia"
          value={`${Math.round(zone.energy)}`}
          unit="kWh"
          quality={{ label: zone.energy > 80 ? 'Alto consumo' : 'Normale', color: zone.energy > 80 ? 'text-orange-400' : 'text-green-400' }}
        />
        <MetricCard
          icon="🔮"
          label="Traffico Previsto"
          value={`${trafficPrediction}`}
          unit="idx (AI)"
          quality={{
            label: trafficPrediction > zone.traffic ? '↑ In aumento' : '↓ In calo',
            color: trafficPrediction > zone.traffic ? 'text-red-400' : 'text-green-400'
          }}
        />
      </div>

      {/* Alert count */}
      {zone.alertCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 text-sm text-red-400">
          ⚠️ {zone.alertCount} alert generati in questa zona
        </div>
      )}

      {/* Recent readings */}
      <div>
        <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">
          Ultime Letture
        </h4>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {zoneReadings.length === 0 ? (
            <p className="text-xs text-gray-600">Nessuna lettura recente</p>
          ) : (
            zoneReadings.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs bg-gray-900/40 rounded px-2 py-1.5">
                <span className="text-gray-500">{r.sensorId}</span>
                <span className="text-gray-400">{r.type.replace('_', ' ')}</span>
                <span className={`font-mono font-medium ${
                  r.status === 'critical' ? 'text-red-400' :
                  r.status === 'warning' ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {r.value} {r.unit}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon, label, value, unit, quality,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  quality: { label: string; color: string };
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">
        {value} <span className="text-xs text-gray-500 font-normal">{unit}</span>
      </div>
      <div className={`text-[10px] ${quality.color}`}>{quality.label}</div>
    </div>
  );
}
