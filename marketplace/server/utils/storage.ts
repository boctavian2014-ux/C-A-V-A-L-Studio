import fs from "node:fs/promises";
import path from "node:path";

export interface StoredExtensionPackage {
  storageKey: string;
  publicUrl: string;
  sizeBytes: number;
}

export class ExtensionStorage {
  constructor(
    private readonly rootDir = process.env.CAVAL_MARKETPLACE_STORAGE_DIR ?? ".caval/marketplace/packages",
    private readonly publicBaseUrl = process.env.CAVAL_MARKETPLACE_PUBLIC_URL ?? "/storage/marketplace"
  ) {}

  async savePackage(extensionId: string, version: string, payload: Buffer): Promise<StoredExtensionPackage> {
    const storageKey = `${extensionId}/${version}/package.vsix`;
    const target = path.join(this.rootDir, storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, payload);

    return {
      storageKey,
      publicUrl: `${this.publicBaseUrl}/${storageKey.replaceAll("\\", "/")}`,
      sizeBytes: payload.byteLength
    };
  }

  async deletePackage(storageKey: string): Promise<void> {
    await fs.rm(path.join(this.rootDir, storageKey), { force: true });
  }
}
