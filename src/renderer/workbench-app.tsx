import React from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/glass.css";
import "./styles/arena-status-icon-motion.css";
import "./monaco-setup";
import { WorkbenchRoot } from "./WorkbenchRoot";
import { I18nProvider } from "../../ai/i18n/I18nProvider";

class WorkbenchErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[caval] React render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0E0E0F",
          color: "#F5F7FA",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 18 }}>CAVAL Studio — eroare UI</h1>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginBottom: 12,
              padding: "8px 14px",
              background: "#1a1d24",
              color: "#f5f7fa",
              border: "1px solid rgba(0,224,255,0.35)",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Reîncarcă interfața
          </button>
          <pre style={{
            whiteSpace: "pre-wrap",
            background: "#15171A",
            border: "1px solid #24262B",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: "#FF8080",
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[caval] Unhandled promise rejection:", event.reason);
  });
  createRoot(rootElement).render(
    <WorkbenchErrorBoundary>
      <I18nProvider>
        <WorkbenchRoot />
      </I18nProvider>
    </WorkbenchErrorBoundary>
  );
} else {
  console.error("[caval] #root element missing — cannot mount React app");
}
