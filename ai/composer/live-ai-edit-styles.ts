/** Live AI edit decorations — imported by MonacoEditor. */
const STYLE_ID = "caval-live-ai-edits-css";

export function ensureLiveAiEditStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
.caval-ai-line-added { background: rgba(47, 191, 113, 0.14) !important; }
.caval-ai-line-removed { background: rgba(239, 68, 68, 0.14) !important; }
.caval-ai-line-modified { background: rgba(245, 158, 11, 0.14) !important; }
.caval-ai-gutter-added {
  background: #2FBF71 !important;
  width: 3px !important;
  margin-left: 3px;
}
.caval-ai-gutter-removed {
  background: #EF4444 !important;
  width: 3px !important;
  margin-left: 3px;
}
.caval-ai-gutter-modified {
  background: #F59E0B !important;
  width: 3px !important;
  margin-left: 3px;
}
@keyframes caval-ai-tab-spin {
  to { transform: rotate(360deg); }
}
.caval-ai-tab-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(0, 224, 255, 0.25);
  border-top-color: #00E0FF;
  border-radius: 50%;
  animation: caval-ai-tab-spin 0.7s linear infinite;
  flex-shrink: 0;
}
.caval-ai-file-card {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--caval-border);
  background: var(--caval-surface);
  color: var(--caval-text);
  font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.caval-ai-file-card:hover {
  border-color: rgba(0, 224, 255, 0.35);
}
.caval-ai-file-card--active {
  border-color: rgba(0, 224, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(0, 224, 255, 0.2);
}
.caval-ai-file-card--writing {
  border-color: rgba(0, 224, 255, 0.4);
  background: rgba(0, 224, 255, 0.04);
}
.caval-ai-file-card-icon {
  width: 22px;
  height: 16px;
  border-radius: 4px;
  font-size: 8px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  color: var(--caval-text-muted);
  flex-shrink: 0;
}
.caval-ai-file-card-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caval-ai-file-card-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 10px;
}
`;
  document.head.appendChild(el);
}
