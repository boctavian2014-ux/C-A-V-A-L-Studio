import React from "react";
import { createRoot } from "react-dom/client";
import "xterm/css/xterm.css";
import { WorkbenchRoot } from "./WorkbenchRoot";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<WorkbenchRoot />);
}
