import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';

function StlMesh({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const loader = new STLLoader();
      loader.load(
        url,
        (geo) => {
          if (!alive) return;
          geo.computeVertexNormals();
          geo.center();
          setGeometry(geo);
        },
        undefined,
        () => {
          if (alive) setGeometry(null);
        }
      );
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#00e0ff" metalness={0.25} roughness={0.45} />
    </mesh>
  );
}

export function CadViewer({ stlUrl }: { stlUrl: string | null }) {
  if (!stlUrl) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--caval-text-muted)',
        fontSize: 13,
        textAlign: 'center',
        padding: 24,
      }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.35 }}>◇</div>
          <div style={{ fontWeight: 600, color: 'var(--caval-text)', marginBottom: 6 }}>
            Niciun model 3D
          </div>
          <div style={{ maxWidth: 320, lineHeight: 1.5 }}>
            Descrie piesa (ex: capac drone Ø80mm) și apasă „Generează model 3D”.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 280, background: '#0a0a0b' }}>
      <Canvas
        shadows
        camera={{ position: [80, 60, 80], fov: 45, near: 0.1, far: 2000 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#0a0a0b'));
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[60, 80, 40]} intensity={1.1} castShadow />
        <Suspense fallback={null}>
          <Center>
            <StlMesh url={stlUrl} />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
