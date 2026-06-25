import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { CadViewerToolbar } from './CadViewerToolbar';
import { dimensionsFromBox3, type StlDimensions } from './cad-viewer-utils';

function StlMesh({
  url,
  wireframe,
  onDimensions,
}: {
  url: string;
  wireframe: boolean;
  onDimensions?: (dims: StlDimensions) => void;
}) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const loader = new STLLoader();
      loader.load(
        url,
        (geo) => {
          if (!alive) {
            geo.dispose();
            return;
          }
          geo.computeVertexNormals();
          geo.computeBoundingBox();
          geo.center();
          geo.computeBoundingBox();
          if (geo.boundingBox) {
            onDimensions?.(dimensionsFromBox3(geo.boundingBox));
          }
          setGeometry((prev) => {
            prev?.dispose();
            return geo;
          });
        },
        undefined,
        () => {
          if (alive) setGeometry(null);
        }
      );
    })();
    return () => {
      alive = false;
      setGeometry((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, [url, onDimensions]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#00e0ff"
        metalness={0.25}
        roughness={0.45}
        wireframe={wireframe}
      />
    </mesh>
  );
}

export function CadViewerCanvas({
  stlUrl,
  wireframe,
  autoRotate,
  dimensionsLabel,
  onDimensions,
  onToggleWireframe,
  onToggleAutoRotate,
}: {
  stlUrl: string;
  wireframe: boolean;
  autoRotate: boolean;
  dimensionsLabel: string | null;
  onDimensions?: (dims: StlDimensions) => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
}) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 280, background: '#0a0a0b', position: 'relative' }}>
      <CadViewerToolbar
        wireframe={wireframe}
        autoRotate={autoRotate}
        dimensionsLabel={dimensionsLabel}
        onToggleWireframe={onToggleWireframe}
        onToggleAutoRotate={onToggleAutoRotate}
      />
      <Canvas
        key={stlUrl}
        shadows
        camera={{ position: [80, 60, 80], fov: 45, near: 0.1, far: 2000 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#0a0a0b'));
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[60, 80, 40]} intensity={1.1} castShadow />
        <Grid
          args={[200, 200]}
          cellSize={5}
          cellThickness={0.4}
          sectionSize={25}
          sectionThickness={0.8}
          fadeDistance={120}
          fadeStrength={1.2}
          position={[0, -0.01, 0]}
          infiniteGrid
        />
        <Suspense fallback={null}>
          <Center>
            <StlMesh url={stlUrl} wireframe={wireframe} onDimensions={onDimensions} />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
        />
      </Canvas>
    </div>
  );
}
