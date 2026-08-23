/**
 * Renderer-safe fs:readFile contract — no absolute OS paths in responses.
 */

export type WorkspaceFileReadErrorCode =
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "OUTSIDE_WORKSPACE"
  | "READ_FAILED"
  | "NO_WORKSPACE";

export type WorkspaceFileReadSuccess = {
  ok: true;
  path: string;
  content: string;
  language: string;
};

export type WorkspaceFileReadFailure = {
  ok: false;
  code: WorkspaceFileReadErrorCode;
  message: string;
};

export type WorkspaceFileReadResult = WorkspaceFileReadSuccess | WorkspaceFileReadFailure;

export const WORKSPACE_FILE_READ_SAFE_MESSAGE =
  "Could not open this workspace file.";

export const WORKSPACE_FILE_READ_FAILURE_RO =
  "Nu am putut citi fișierul din workspace. Verific calea și starea folderului înainte să continui.";
