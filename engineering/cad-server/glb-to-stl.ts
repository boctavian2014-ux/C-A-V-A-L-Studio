/** Convert a GLB (glTF binary) buffer to binary STL for FDM download / CadViewer. */

export async function convertGlbToStl(glb: Buffer): Promise<Buffer> {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");

  const loader = new GLTFLoader();
  const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;

  const gltf = await new Promise<{ scene: InstanceType<typeof THREE.Group> }>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      "",
      (result) => resolve(result as { scene: InstanceType<typeof THREE.Group> }),
      (err) => reject(err instanceof Error ? err : new Error(String(err)))
    );
  });

  if (!gltf.scene) {
    throw new Error("GLB has no scene");
  }

  gltf.scene.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const exported = exporter.parse(gltf.scene, { binary: true }) as DataView | string;
  if (typeof exported === "string") {
    return Buffer.from(exported, "utf8");
  }
  return Buffer.from(exported.buffer, exported.byteOffset, exported.byteLength);
}
