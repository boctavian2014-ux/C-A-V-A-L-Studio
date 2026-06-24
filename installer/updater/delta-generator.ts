import crypto from "node:crypto";
import fs from "node:fs/promises";

export interface DeltaPatchManifest {
  fromVersion: string;
  toVersion: string;
  baseSha512: string;
  targetSha512: string;
  deltaSha512: string;
  deltaPath: string;
  algorithm: "binary-xor-placeholder";
}

export class DeltaGenerator {
  async generate(fromArtifact: string, toArtifact: string, deltaPath: string, fromVersion: string, toVersion: string): Promise<DeltaPatchManifest> {
    const from = await fs.readFile(fromArtifact);
    const target = await fs.readFile(toArtifact);
    const size = Math.max(from.length, target.length);
    const delta = Buffer.alloc(size);

    for (let index = 0; index < size; index += 1) {
      delta[index] = (from[index] ?? 0) ^ (target[index] ?? 0);
    }

    await fs.writeFile(deltaPath, delta);
    return {
      fromVersion,
      toVersion,
      baseSha512: this.sha512(from),
      targetSha512: this.sha512(target),
      deltaSha512: this.sha512(delta),
      deltaPath,
      algorithm: "binary-xor-placeholder"
    };
  }

  private sha512(buffer: Buffer): string {
    return crypto.createHash("sha512").update(buffer).digest("base64");
  }
}
