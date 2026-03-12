/**
 * Digital Twin 3D - Visualizzazione della città con React Three Fiber
 * Ogni edificio rappresenta una zona e reagisce ai dati real-time.
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import type { ZoneData, SensorType } from '../data/sensorSimulator';
import * as THREE from 'three';

// === Colori basati sul valore del sensore ===
function getStatusColor(value: number, type: SensorType): string {
  if (type === 'air_quality') {
    // AQI: basso = buono (verde), alto = cattivo (rosso)
    if (value > 75) return '#22c55e';
    if (value > 50) return '#eab308';
    if (value > 30) return '#f97316';
    return '#ef4444';
  }
  if (type === 'traffic') {
    if (value < 30) return '#22c55e';
    if (value < 60) return '#eab308';
    if (value < 80) return '#f97316';
    return '#ef4444';
  }
  if (type === 'temperature') {
    if (value < 25) return '#3b82f6';
    if (value < 30) return '#22c55e';
    if (value < 35) return '#f97316';
    return '#ef4444';
  }
  return '#6366f1';
}

// === Edificio singolo ===
function Building({
  zone,
  selectedMetric,
  onClick,
  isSelected,
}: {
  zone: ZoneData;
  selectedMetric: SensorType;
  onClick: () => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  const metricValue = useMemo(() => {
    const map: Record<SensorType, number> = {
      traffic: zone.traffic,
      air_quality: zone.airQuality,
      temperature: zone.temperature,
      noise: zone.noise,
      energy: zone.energy,
    };
    return map[selectedMetric];
  }, [zone, selectedMetric]);

  const height = useMemo(() => 0.5 + (metricValue / 100) * 3, [metricValue]);
  const color = useMemo(() => getStatusColor(metricValue, selectedMetric), [metricValue, selectedMetric]);

  useFrame((state) => {
    if (meshRef.current) {
      const targetY = height / 2;
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, 0.05);
      meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, height, 0.05);

      if (isSelected) {
        meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2) * 0.05;
      }
    }

    if (glowRef.current) {
      const pulse = zone.alertCount > 0 ? 0.8 + Math.sin(state.clock.elapsedTime * 4) * 0.2 : 0;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  return (
    <group position={[zone.position.x * 2.5, 0, zone.position.y * 2.5]}>
      {/* Base platform */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[2, 0.1, 2]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Main building */}
      <mesh
        ref={meshRef}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <boxGeometry args={[1.4, 1, 1.4]} />
        <meshStandardMaterial
          color={color}
          metalness={0.3}
          roughness={0.4}
          emissive={color}
          emissiveIntensity={isSelected ? 0.4 : 0.15}
        />
      </mesh>

      {/* Alert glow ring */}
      <mesh ref={glowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.15, 32]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Label */}
      <Text
        position={[0, height + 0.6, 0]}
        fontSize={0.18}
        color="white"
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {zone.name.length > 16 ? zone.name.substring(0, 14) + '...' : zone.name}
      </Text>

      {/* Value label */}
      <Text
        position={[0, height + 0.3, 0]}
        fontSize={0.22}
        color={color}
        anchorX="center"
        anchorY="middle"
        font={undefined}
        fontWeight="bold"
      >
        {Math.round(metricValue)}
      </Text>
    </group>
  );
}

// === Griglia stradale ===
function CityGrid() {
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Grid lines */}
      <gridHelper args={[20, 20, '#1e3a5f', '#0d2137']} position={[0, -0.11, 0]} />

      {/* Roads */}
      {[-5, 0, 5].map((pos) => (
        <group key={`road-h-${pos}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.10, pos]}>
            <planeGeometry args={[20, 0.6]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos, -0.10, 0]}>
            <planeGeometry args={[0.6, 20]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// === Data particles (data flowing) ===
function DataParticles() {
  const particlesRef = useRef<THREE.Points>(null!);
  const count = 80;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 6 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      const posArr = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        posArr[i * 3 + 1] += 0.01;
        if (posArr[i * 3 + 1] > 7) posArr[i * 3 + 1] = 1;
        posArr[i * 3] += Math.sin(state.clock.elapsedTime + i) * 0.002;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#60a5fa" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// === Componente principale ===
export default function DigitalTwin3D({
  zones,
  selectedMetric,
  onZoneSelect,
  selectedZone,
}: {
  zones: ZoneData[];
  selectedMetric: SensorType;
  onZoneSelect: (zone: ZoneData | null) => void;
  selectedZone: ZoneData | null;
}) {
  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ position: [12, 10, 12], fov: 45 }}
        style={{ background: '#030712' }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-5, 8, -5]} intensity={0.5} color="#60a5fa" />
        <pointLight position={[5, 8, 5]} intensity={0.3} color="#a78bfa" />

        <CityGrid />
        <DataParticles />

        {zones.map((zone) => (
          <Building
            key={zone.name}
            zone={zone}
            selectedMetric={selectedMetric}
            onClick={() => onZoneSelect(selectedZone?.name === zone.name ? null : zone)}
            isSelected={selectedZone?.name === zone.name}
          />
        ))}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={5}
          maxDistance={25}
          maxPolarAngle={Math.PI / 2.2}
        />

        <fog attach="fog" args={['#030712', 15, 30]} />
      </Canvas>


    </div>
  );
}
