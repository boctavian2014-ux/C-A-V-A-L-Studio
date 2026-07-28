import React, {
  forwardRef,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Center,
  Environment,
  Grid,
  TransformControls,
  Line,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';
import { CadViewerToolbar } from './CadViewerToolbar';
import { dimensionsFromBox3, type StlDimensions } from './cad-viewer-utils';
import {
  cameraPresetLookAt,
  clipPlaneConstant,
  clipPlaneNormal,
  distanceMm,
  explodeOffsets,
  formatDistanceMm,
  isTransformDirty,
  type CadCameraPreset,
  type CadGizmoMode,
  type CadSectionAxis,
  type CadToolMode,
} from './cad-viewer-tools';
import {
  arrayBufferToBase64,
  bakeMeshToBinaryStl,
} from './stl-bake';

export type CadBatchViewerPart = {
  id: string;
  name: string;
  stlUrl: string;
};

export type CadViewerCanvasHandle = {
  bakeEditedStlBase64: () => string | null;
  capturePngDataUrl: () => string | null;
  resetTransform: () => void;
  setCameraPreset: (preset: CadCameraPreset) => void;
};

type OrbitControlsLike = {
  target: THREE.Vector3;
  update: () => void;
  enabled: boolean;
};

function loadStlGeometry(
  url: string,
  onDimensions?: (dims: StlDimensions) => void
): Promise<THREE.BufferGeometry | null> {
  return (async () => {
    try {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const loader = new STLLoader();

      const applyGeo = (geo: THREE.BufferGeometry) => {
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.center();
        geo.computeBoundingBox();
        if (geo.boundingBox && onDimensions) {
          onDimensions(dimensionsFromBox3(geo.boundingBox));
        }
        return geo;
      };

      const needsAuthFetch = /^https?:\/\//i.test(url) && /\/cad\/jobs\//i.test(url);
      if (needsAuthFetch && window.caval?.cad?.fetchStl) {
        const userIdResult = await window.caval.billingUserId?.();
        const fetched = await window.caval.cad.fetchStl({
          url,
          cavalId: userIdResult?.userId,
        });
        if (!fetched.ok || !fetched.base64) return null;
        const binary = Uint8Array.from(atob(fetched.base64), (c) => c.charCodeAt(0));
        return applyGeo(loader.parse(binary.buffer));
      }

      return await new Promise<THREE.BufferGeometry | null>((resolve) => {
        loader.load(
          url,
          (geo) => resolve(applyGeo(geo)),
          undefined,
          () => resolve(null)
        );
      });
    } catch {
      return null;
    }
  })();
}

function StlMeshObject({
  url,
  wireframe,
  position,
  meshRef,
  clippingPlanes,
  onDimensions,
  onPointerDown,
}: {
  url: string;
  wireframe: boolean;
  position: [number, number, number];
  meshRef?: React.RefObject<THREE.Mesh | null>;
  clippingPlanes: THREE.Plane[];
  onDimensions?: (dims: StlDimensions) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const localRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    let alive = true;
    void loadStlGeometry(url, onDimensions).then((geo) => {
      if (!alive) {
        geo?.dispose();
        return;
      }
      setGeometry((prev) => {
        prev?.dispose();
        return geo;
      });
    });
    return () => {
      alive = false;
      setGeometry((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, [url, onDimensions]);

  useEffect(() => {
    if (!meshRef) return;
    (meshRef as React.MutableRefObject<THREE.Mesh | null>).current = localRef.current;
  });

  if (!geometry) return null;

  return (
    <mesh
      ref={localRef}
      geometry={geometry}
      position={position}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
    >
      <meshStandardMaterial
        color="#00e0ff"
        metalness={0.25}
        roughness={0.45}
        wireframe={wireframe}
        clippingPlanes={clippingPlanes}
        clipShadows
      />
    </mesh>
  );
}

function MeasureOverlay({
  points,
  label,
}: {
  points: THREE.Vector3[];
  label: string | null;
}) {
  if (points.length === 0) return null;
  const mid =
    points.length === 2
      ? new THREE.Vector3().addVectors(points[0]!, points[1]!).multiplyScalar(0.5)
      : points[0]!;

  return (
    <>
      {points.length === 2 && (
        <Line
          points={[points[0]!, points[1]!]}
          color="#fbbf24"
          lineWidth={2}
        />
      )}
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[1.2, 12, 12]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      ))}
      {label && (
        <Html position={mid} style={{ pointerEvents: 'none' }}>
          <div style={{
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(14,14,15,0.9)',
            border: '1px solid #fbbf24',
            color: '#fbbf24',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {label}
          </div>
        </Html>
      )}
    </>
  );
}

function CameraController({
  presetRequest,
  boundingRadius,
}: {
  presetRequest: { id: number; preset: CadCameraPreset } | null;
  boundingRadius: number;
}) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsLike | null;

  useEffect(() => {
    if (!presetRequest) return;
    const look = cameraPresetLookAt(presetRequest.preset, boundingRadius);
    camera.position.set(look.position.x, look.position.y, look.position.z);
    if (controls?.target) {
      controls.target.set(look.target.x, look.target.y, look.target.z);
      controls.update();
    } else {
      camera.lookAt(look.target.x, look.target.y, look.target.z);
    }
    camera.updateProjectionMatrix();
  }, [presetRequest, boundingRadius, camera, controls]);

  return null;
}

function MeshReadyBridge({
  meshRef,
  onReady,
}: {
  meshRef: React.RefObject<THREE.Mesh | null>;
  onReady: (mesh: THREE.Mesh | null) => void;
}) {
  useEffect(() => {
    const id = window.setInterval(() => {
      onReady(meshRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [meshRef, onReady]);
  return null;
}

function GizmoControls({
  object,
  mode,
  enabled,
  onDirty,
  onDragging,
}: {
  object: THREE.Object3D | null;
  mode: CadGizmoMode;
  enabled: boolean;
  onDirty: (dirty: boolean) => void;
  onDragging: (dragging: boolean) => void;
}) {
  if (!enabled || !object) return null;

  const readDirty = () =>
    isTransformDirty(
      object.position,
      { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
      object.scale
    );

  return (
    <TransformControls
      object={object}
      mode={mode}
      onMouseDown={() => onDragging(true)}
      onMouseUp={() => {
        onDragging(false);
        onDirty(readDirty());
      }}
      onObjectChange={() => onDirty(readDirty())}
    />
  );
}

function SceneContent({
  primaryUrl,
  batchParts,
  wireframe,
  showGrid,
  autoRotate,
  toolMode,
  gizmoMode,
  sectionAxis,
  sectionOffset,
  explodeAmount,
  orbitEnabled,
  dragging,
  presetRequest,
  primaryMeshRef,
  gizmoObject,
  measurePoints,
  measureLabel,
  boundRadius,
  onDimensions,
  onMeasureClick,
  onDirty,
  onDragging,
  onBoundRadius,
  onGizmoObject,
}: {
  primaryUrl: string;
  batchParts: CadBatchViewerPart[];
  wireframe: boolean;
  showGrid: boolean;
  autoRotate: boolean;
  toolMode: CadToolMode;
  gizmoMode: CadGizmoMode;
  sectionAxis: CadSectionAxis;
  sectionOffset: number;
  explodeAmount: number;
  orbitEnabled: boolean;
  dragging: boolean;
  presetRequest: { id: number; preset: CadCameraPreset } | null;
  primaryMeshRef: React.RefObject<THREE.Mesh | null>;
  gizmoObject: THREE.Object3D | null;
  measurePoints: THREE.Vector3[];
  measureLabel: string | null;
  boundRadius: number;
  onDimensions?: (dims: StlDimensions) => void;
  onMeasureClick: (point: THREE.Vector3) => void;
  onDirty: (dirty: boolean) => void;
  onDragging: (dragging: boolean) => void;
  onBoundRadius: (r: number) => void;
  onGizmoObject: (mesh: THREE.Mesh | null) => void;
}) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    gl.localClippingEnabled = toolMode === 'section';
  }, [gl, toolMode]);

  const clippingPlanes = useMemo(() => {
    if (toolMode !== 'section') return [];
    const n = clipPlaneNormal(sectionAxis);
    const plane = new THREE.Plane(
      new THREE.Vector3(n.x, n.y, n.z),
      clipPlaneConstant(sectionAxis, sectionOffset)
    );
    return [plane];
  }, [toolMode, sectionAxis, sectionOffset]);

  const multi = batchParts.length >= 2 && explodeAmount > 0;
  const offsets = useMemo(
    () => explodeOffsets(multi ? batchParts.length : 1, explodeAmount),
    [multi, batchParts.length, explodeAmount]
  );

  const handlePrimaryDims = useCallback(
    (dims: StlDimensions) => {
      onDimensions?.(dims);
      const r = Math.max(dims.widthMm, dims.heightMm, dims.depthMm) / 2;
      onBoundRadius(Math.max(r, 20));
    },
    [onDimensions, onBoundRadius]
  );

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (toolMode !== 'measure') return;
      event.stopPropagation();
      onMeasureClick(event.point.clone());
    },
    [toolMode, onMeasureClick]
  );

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[60, 80, 40]} intensity={1.1} castShadow />
      {showGrid && (
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
      )}
      <Suspense fallback={null}>
        {multi ? (
          batchParts.map((part, i) => {
            const off = offsets[i] ?? { x: 0, y: 0, z: 0 };
            const isPrimary = part.stlUrl === primaryUrl || i === 0;
            return (
              <group key={part.id} position={[off.x, off.y, off.z]}>
                <Center>
                  <StlMeshObject
                    url={part.stlUrl}
                    wireframe={wireframe}
                    position={[0, 0, 0]}
                    meshRef={isPrimary ? primaryMeshRef : undefined}
                    clippingPlanes={clippingPlanes}
                    onDimensions={isPrimary ? handlePrimaryDims : undefined}
                    onPointerDown={isPrimary ? onPointerDown : undefined}
                  />
                </Center>
              </group>
            );
          })
        ) : (
          <Center>
            <StlMeshObject
              url={primaryUrl}
              wireframe={wireframe}
              position={[0, 0, 0]}
              meshRef={primaryMeshRef}
              clippingPlanes={clippingPlanes}
              onDimensions={handlePrimaryDims}
              onPointerDown={onPointerDown}
            />
          </Center>
        )}
        <Environment preset="city" />
      </Suspense>
      <MeasureOverlay points={measurePoints} label={measureLabel} />
      <MeshReadyBridge meshRef={primaryMeshRef} onReady={onGizmoObject} />
      <GizmoControls
        object={gizmoObject}
        mode={gizmoMode}
        enabled={toolMode === 'gizmo'}
        onDirty={onDirty}
        onDragging={onDragging}
      />
      <CameraController presetRequest={presetRequest} boundingRadius={boundRadius} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate && toolMode === 'idle' && !dragging}
        autoRotateSpeed={1.2}
        enabled={orbitEnabled}
      />
    </>
  );
}

export const CadViewerCanvas = forwardRef<
  CadViewerCanvasHandle,
  {
    stlUrl: string;
    batchParts: CadBatchViewerPart[];
    wireframe: boolean;
    autoRotate: boolean;
    showGrid: boolean;
    toolMode: CadToolMode;
    gizmoMode: CadGizmoMode;
    sectionAxis: CadSectionAxis;
    sectionOffset: number;
    explodeAmount: number;
    dirty: boolean;
    hasEditedStl: boolean;
    dimensionsLabel: string | null;
    statusLabel: string | null;
    onDimensions?: (dims: StlDimensions) => void;
    onToggleWireframe: () => void;
    onToggleAutoRotate: () => void;
    onToggleGrid: () => void;
    onSetToolMode: (mode: CadToolMode) => void;
    onSetGizmoMode: (mode: CadGizmoMode) => void;
    onSectionAxis: (axis: CadSectionAxis) => void;
    onSectionOffset: (offset: number) => void;
    onExplodeAmount: (amount: number) => void;
    onDirtyChange: (dirty: boolean) => void;
    onSaveEdits: () => void;
    onExportPng: () => void;
    onCameraPreset: (preset: CadCameraPreset) => void;
    onResetTransform: () => void;
    onMeasureLabel: (label: string | null) => void;
  }
>(function CadViewerCanvas(props, ref) {
  const {
    stlUrl,
    batchParts,
    wireframe,
    autoRotate,
    showGrid,
    toolMode,
    gizmoMode,
    sectionAxis,
    sectionOffset,
    explodeAmount,
    dirty,
    hasEditedStl,
    dimensionsLabel,
    statusLabel,
    onDimensions,
    onToggleWireframe,
    onToggleAutoRotate,
    onToggleGrid,
    onSetToolMode,
    onSetGizmoMode,
    onSectionAxis,
    onSectionOffset,
    onExplodeAmount,
    onDirtyChange,
    onSaveEdits,
    onExportPng,
    onCameraPreset,
    onResetTransform,
    onMeasureLabel,
  } = props;

  const primaryMeshRef = useRef<THREE.Mesh | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gizmoObject, setGizmoObject] = useState<THREE.Mesh | null>(null);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [measureLabel, setMeasureLabel] = useState<string | null>(null);
  const [presetRequest, setPresetRequest] = useState<{
    id: number;
    preset: CadCameraPreset;
  } | null>(null);
  const [boundRadius, setBoundRadius] = useState(40);
  const presetId = useRef(0);

  const explodeEnabled = batchParts.length >= 2;

  useEffect(() => {
    setMeasurePoints([]);
    setMeasureLabel(null);
    onMeasureLabel(null);
  }, [stlUrl, toolMode, onMeasureLabel]);

  const requestCamera = useCallback(
    (preset: CadCameraPreset) => {
      presetId.current += 1;
      setPresetRequest({ id: presetId.current, preset });
      onCameraPreset(preset);
    },
    [onCameraPreset]
  );

  const resetTransform = useCallback(() => {
    const mesh = primaryMeshRef.current;
    if (!mesh) return;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    onDirtyChange(false);
    onResetTransform();
  }, [onDirtyChange, onResetTransform]);

  const bakeEditedStlBase64 = useCallback((): string | null => {
    const mesh = primaryMeshRef.current;
    if (!mesh?.geometry) return null;
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return null;
    const positions = posAttr.array as Float32Array;
    const index = geo.getIndex();
    const matrix = mesh.matrixWorld.toArray();
    const buffer = bakeMeshToBinaryStl({
      positions,
      indices: index ? index.array : null,
      matrix,
    });
    return arrayBufferToBase64(buffer);
  }, []);

  const capturePngDataUrl = useCallback((): string | null => {
    const gl = glRef.current;
    if (!gl) return null;
    try {
      return gl.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      bakeEditedStlBase64,
      capturePngDataUrl,
      resetTransform,
      setCameraPreset: requestCamera,
    }),
    [bakeEditedStlBase64, capturePngDataUrl, resetTransform, requestCamera]
  );

  const onMeasureClick = useCallback(
    (point: THREE.Vector3) => {
      setMeasurePoints((prev) => {
        if (prev.length >= 2) {
          setMeasureLabel(null);
          onMeasureLabel(null);
          return [point];
        }
        const next = [...prev, point];
        if (next.length === 2) {
          const label = formatDistanceMm(distanceMm(next[0]!, next[1]!));
          setMeasureLabel(label);
          onMeasureLabel(label);
        }
        return next;
      });
    },
    [onMeasureLabel]
  );

  const onGizmoObject = useCallback((mesh: THREE.Mesh | null) => {
    setGizmoObject((prev) => (prev === mesh ? prev : mesh));
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 280, background: '#0a0a0b', position: 'relative' }}>
      <CadViewerToolbar
        wireframe={wireframe}
        autoRotate={autoRotate}
        showGrid={showGrid}
        toolMode={toolMode}
        gizmoMode={gizmoMode}
        sectionAxis={sectionAxis}
        sectionOffset={sectionOffset}
        explodeAmount={explodeAmount}
        explodeEnabled={explodeEnabled}
        dirty={dirty}
        hasEditedStl={hasEditedStl}
        dimensionsLabel={dimensionsLabel}
        statusLabel={statusLabel}
        onToggleWireframe={onToggleWireframe}
        onToggleAutoRotate={onToggleAutoRotate}
        onToggleGrid={onToggleGrid}
        onSetToolMode={onSetToolMode}
        onSetGizmoMode={onSetGizmoMode}
        onCameraPreset={requestCamera}
        onSectionAxis={onSectionAxis}
        onSectionOffset={onSectionOffset}
        onExplodeAmount={onExplodeAmount}
        onResetTransform={resetTransform}
        onSaveEdits={onSaveEdits}
        onExportPng={onExportPng}
      />
      <Canvas
        key={stlUrl}
        shadows
        camera={{ position: [80, 60, 80], fov: 45, near: 0.1, far: 2000 }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.setClearColor(new THREE.Color('#0a0a0b'));
          gl.localClippingEnabled = true;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <SceneContent
          primaryUrl={stlUrl}
          batchParts={batchParts}
          wireframe={wireframe}
          showGrid={showGrid}
          autoRotate={autoRotate}
          toolMode={toolMode}
          gizmoMode={gizmoMode}
          sectionAxis={sectionAxis}
          sectionOffset={sectionOffset}
          explodeAmount={explodeAmount}
          orbitEnabled={!dragging}
          dragging={dragging}
          presetRequest={presetRequest}
          primaryMeshRef={primaryMeshRef}
          gizmoObject={gizmoObject}
          measurePoints={measurePoints}
          measureLabel={measureLabel}
          boundRadius={boundRadius}
          onDimensions={onDimensions}
          onMeasureClick={onMeasureClick}
          onDirty={onDirtyChange}
          onDragging={setDragging}
          onBoundRadius={setBoundRadius}
          onGizmoObject={onGizmoObject}
        />
      </Canvas>
    </div>
  );
});
