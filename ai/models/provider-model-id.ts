import type { ModelDescriptor } from "../types";

/** Resolves the model slug sent to the provider API. */
export function resolveProviderModelId(model: ModelDescriptor): string {
  if (model.providerModelId) {
    return model.providerModelId;
  }
  if (model.id.startsWith("openrouter:")) {
    return model.id.replace(/^openrouter:/, "");
  }
  return model.id;
}
