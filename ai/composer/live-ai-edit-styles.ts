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
`;
  document.head.appendChild(el);
}
