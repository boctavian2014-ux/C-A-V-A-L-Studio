import "./monaco-setup";
import React from "react";
import { createRoot } from "react-dom/client";
import "xterm/css/xterm.css";
import { WorkbenchRoot } from "./WorkbenchRoot";

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
          <h1 style={{ margin: "0 0 12px", fontSize: 18 }}>CAVALLO Studio — eroare UI</h1>
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
  createRoot(rootElement).render(
    <WorkbenchErrorBoundary>
      <WorkbenchRoot />
    </WorkbenchErrorBoundary>
  );
} else {
  console.error("[caval] #root element missing — cannot mount React app");
}
