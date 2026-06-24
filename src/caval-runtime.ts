import { createArchitectureManifest } from "./platform/architecture-manifest";

export class CavalRuntime {
  describe() {
    return createArchitectureManifest();
  }
}
