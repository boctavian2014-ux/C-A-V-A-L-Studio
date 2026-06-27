import type { StlDimensions } from "../types";

const localStlFiles = new Map<string, Buffer>();
const localStlDimensions = new Map<string, StlDimensions>();
const localMeshTaskIds = new Map<string, string>();

export const setLocalStl = (
  jobId: string,
  buffer: Buffer,
  dimensions?: StlDimensions | null,
  meshTaskId?: string | null
): void => {
  localStlFiles.set(jobId, buffer);
  if (dimensions) localStlDimensions.set(jobId, dimensions);
  if (meshTaskId) localMeshTaskIds.set(jobId, meshTaskId);
};

export const getLocalStlBuffer = (jobId: string): Buffer | undefined =>
  localStlFiles.get(jobId);

export const getLocalStlDimensions = (jobId: string): StlDimensions | undefined =>
  localStlDimensions.get(jobId);

export const getLocalMeshTaskId = (jobId: string): string | undefined =>
  localMeshTaskIds.get(jobId);

export const clearLocalArtifacts = (jobId: string): void => {
  localStlFiles.delete(jobId);
  localStlDimensions.delete(jobId);
  localMeshTaskIds.delete(jobId);
};

export const resetLocalArtifactsForTests = (): void => {
  localStlFiles.clear();
  localStlDimensions.clear();
  localMeshTaskIds.clear();
};
