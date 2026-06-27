/**
 * Remove solid black background from neon horse logo.
 * Keeps cyan/blue glow lines + adds soft blue under-light.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const SOURCES = [
  path.join(ROOT, "assets", "cavalo-neon-horse.png"),
  path.join(
    ROOT,
    "assets",
    "c__Users_octav_AppData_Roaming_Cursor_User_workspaceStorage_e47196c2de70d2badf691a5cc3820572_images_cavalo-neon-horse_transparent-e7a0168b-3ad4-4c5c-96cc-90fecea16eac.png"
  ),
];

function stripBlackBackground(data: Buffer, width: number, height: number): void {
  const isNearBlack = (i: number): boolean => {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const blueGlow = b > 35 && b >= r * 0.65 && b >= g * 0.55;
    const cyanEdge = b > 25 && g > 15 && lum > 20;
    return lum < 28 && !blueGlow && !cyanEdge;
  };

  const bg = new Uint8Array(width * height);
  const queue: number[] = [];

  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (bg[idx]) return;
    const i = idx * 4;
    if (!isNearBlack(i)) return;
    bg[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    pushIfBg(x - 1, y);
    pushIfBg(x + 1, y);
    pushIfBg(x, y - 1);
    pushIfBg(x, y + 1);
  }

  for (let idx = 0; idx < width * height; idx++) {
    const i = idx * 4;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const blueGlow = b > 35 && b >= r * 0.65 && b >= g * 0.55;
    const cyanEdge = b > 25 && g > 15 && lum > 20;

    if (bg[idx]) {
      data[i + 3] = 0;
    } else if ((lum < 40 && !blueGlow && !cyanEdge) || (r < 12 && g < 12 && b < 12)) {
      data[i + 3] = 0;
    } else if (lum < 50 && !blueGlow) {
      data[i + 3] = Math.min(255, Math.round((lum - 8) * 6));
    }
  }
}

async function createUnderGlow(size: number): Promise<Buffer> {
  const cx = size * 0.5;
  const cy = size * 0.88;
  const rx = size * 0.38;
  const ry = size * 0.12;

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgb(0,210,255)" stop-opacity="0.85"/>
        <stop offset="45%" stop-color="rgb(0,160,255)" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="rgb(0,100,255)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#g)"/>
  </svg>`;

  return sharp(Buffer.from(svg)).blur(8).png().toBuffer();
}

async function processSource(source: string): Promise<Buffer | null> {
  try {
    await fs.access(source);
  } catch {
    return null;
  }

  const meta = await sharp(source).metadata();
  const size = meta.width ?? 1024;

  const { data, info } = await sharp(source)
    .ensureAlpha()
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  stripBlackBackground(data, info.width, info.height);

  const horse = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const under = await createUnderGlow(info.width);

  return sharp({
    create: {
      width: info.width,
      height: info.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: under, blend: "screen" },
      { input: horse, blend: "over" },
    ])
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  let output: Buffer | null = null;
  for (const src of SOURCES) {
    output = await processSource(src);
    if (output) {
      console.info("[process-neon-horse] Source:", src);
      break;
    }
  }
  if (!output) throw new Error("No source image found");

  const targets = [
    path.join(ROOT, "assets", "cavalo-neon-horse.png"),
    path.join(ROOT, "assets", "cavalo-icon.png"),
    path.join(ROOT, "src", "renderer", "assets", "cavalo-icon.png"),
  ];

  for (const target of targets) {
    const buf =
      target.includes("cavalo-icon")
        ? await sharp(output).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
        : output;
    await fs.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, buf);
    try {
      await fs.unlink(target);
    } catch {
      /* first run or locked — overwrite via tmp rename fallback */
    }
    try {
      await fs.rename(tmp, target);
    } catch {
      await fs.writeFile(target, buf);
      await fs.unlink(tmp).catch(() => undefined);
    }
    console.info("[process-neon-horse] Wrote:", target);
  }

  const alphaCopy = path.join(ROOT, "assets", "cavalo-neon-horse-alpha.png");
  await fs.writeFile(alphaCopy, output);
  console.info("[process-neon-horse] Wrote:", alphaCopy);

  console.info("[process-neon-horse] Done — transparent PNG, blue under-glow, no black square.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
