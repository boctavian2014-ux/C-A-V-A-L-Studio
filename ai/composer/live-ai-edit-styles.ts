/** Live AI edit decorations — imported by MonacoEditor. */
const STYLE_ID = "caval-live-ai-edits-css";

export function ensureLiveAiEditStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
.caval-ai-line-added {
  background: rgba(0, 224, 255, 0.14) !important;
  animation: caval-ai-line-fade 5s ease-out forwards;
}
.caval-ai-line-removed { background: rgba(239, 68, 68, 0.12) !important; }
.caval-ai-line-modified {
  background: rgba(0, 224, 255, 0.1) !important;
  animation: caval-ai-line-fade 5s ease-out forwards;
}
@keyframes caval-ai-line-fade {
  0% { background: rgba(0, 224, 255, 0.2) !important; }
  100% { background: transparent !important; }
}
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
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--caval-text);
  font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.caval-ai-file-card:hover {
  border-color: rgba(0, 224, 255, 0.28);
  background: rgba(255, 255, 255, 0.02);
}
.caval-ai-file-card--active {
  border-color: rgba(0, 224, 255, 0.45);
  border-bottom-color: var(--caval-accent);
  background: rgba(0, 224, 255, 0.04);
  box-shadow: none;
}
.caval-ai-file-card--writing {
  border-color: rgba(0, 224, 255, 0.32);
  background: rgba(0, 224, 255, 0.03);
}
[data-testid="live-ai-file-cards"] > div:first-child {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
[data-testid="live-ai-file-cards"] {
  position: relative;
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
.caval-ai-work-canvas-pulse {
  display: inline-flex;
  color: #00E0FF;
  animation: caval-ai-work-pulse 2.4s ease-in-out infinite;
}
.caval-ai-work-canvas-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 224, 255, 0.35);
  border-top-color: #00E0FF;
  animation: caval-ai-tab-spin 0.9s linear infinite;
  flex-shrink: 0;
}
@keyframes caval-ai-work-pulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
  document.head.appendChild(el);
}
