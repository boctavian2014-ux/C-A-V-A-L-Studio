/**
 * Export CAVALO app icons:
 * - assets/cavalo-neon-horse.png (app — neon horse, transparent + blue under-glow)
 * - assets/icons/3d/png_1024/icon_ai.png (AI variant)
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import * as png2icons from "png2icons";

const ROOT = path.resolve(__dirname, "..");
const EXPORT_SIZES = [1024, 512, 256, 128, 64, 32, 16] as const;
const ICO_SIZES = [256, 128, 64, 48, 32, 16] as const;

const APP_MASTER = path.join(ROOT, "assets", "cavalo-neon-horse.png");
const AI_MASTER = path.join(ROOT, "assets", "icons", "3d", "png_1024", "icon_ai.png");

const resizePng = async (source: string, size: number): Promise<Buffer> =>
  sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

const exportSizeSet = async (
  source: string,
  outDir: string,
  baseName: string
): Promise<Map<number, Buffer>> => {
  await fs.mkdir(outDir, { recursive: true });
  const buffers = new Map<number, Buffer>();
  for (const size of EXPORT_SIZES) {
    const buf = await resizePng(source, size);
    buffers.set(size, buf);
    await fs.writeFile(path.join(outDir, `${baseName}-${size}.png`), buf);
  }
  return buffers;
};

const writeFile = async (target: string, data: Buffer) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
};

async function main(): Promise<void> {
  const iconsDir = path.join(ROOT, "branding", "icons");
  const buildDir = path.join(ROOT, "build-icons");

  console.info("[build-icons] Exporting PNG size sets from brand masters…");
  const appBuffers = await exportSizeSet(APP_MASTER, iconsDir, "app-icon");
  await exportSizeSet(AI_MASTER, iconsDir, "app-icon-ai");

  const app1024 = appBuffers.get(1024)!;
  const app512 = appBuffers.get(512)!;
  const ai256 = await resizePng(AI_MASTER, 256);

  await writeFile(path.join(ROOT, "branding", "app-icon-rounded.png"), app1024);

  console.info("[build-icons] Writing build-icons/ (electron-builder)…");
  await fs.mkdir(buildDir, { recursive: true });
  await writeFile(path.join(buildDir, "icon.png"), app512);

  const icoBuffers = await Promise.all(ICO_SIZES.map((s) => resizePng(APP_MASTER, s)));
  const ico = await pngToIco(icoBuffers);
  await writeFile(path.join(buildDir, "icon.ico"), ico);

  const icns = png2icons.createICNS(app512, png2icons.BILINEAR, 0);
  if (!icns) {
    throw new Error("png2icons.createICNS returned null");
  }
  await writeFile(path.join(buildDir, "icon.icns"), Buffer.from(icns));

  console.info("[build-icons] Syncing renderer + root assets…");
  for (const target of [
    path.join(ROOT, "assets", "cavalo-icon.png"),
    path.join(ROOT, "src", "renderer", "assets", "cavalo-icon.png"),
  ]) {
    await writeFile(target, app512);
  }
  for (const target of [
    path.join(ROOT, "assets", "cavalo-icon-ai.png"),
    path.join(ROOT, "src", "renderer", "assets", "cavalo-icon-ai.png"),
  ]) {
    await writeFile(target, ai256);
  }

  console.info("[build-icons] Done.");
  console.info(`  Source:      ${APP_MASTER}`);
  console.info(`  PNG exports: ${iconsDir}`);
  console.info(`  Platform:    ${buildDir}/icon.{png,ico,icns}`);
}

main().catch((err) => {
  console.error("[build-icons] Failed:", err);
  process.exit(1);
});
