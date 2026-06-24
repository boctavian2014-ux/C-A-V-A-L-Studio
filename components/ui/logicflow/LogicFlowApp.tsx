import { createPortal } from "react-dom";
import { ConfirmHost } from "../ConfirmHost";
import { LogicFlowCanvas } from "./LogicFlowCanvas";
import { LogicFlowInspector } from "./LogicFlowInspector";
import { LogicFlowSidebar } from "./LogicFlowSidebar";

export interface LogicFlowMountTargets {
  sidebar: HTMLElement;
  canvas: HTMLElement;
  inspector: HTMLElement;
}

export const LogicFlowApp = ({ sidebar, canvas, inspector }: LogicFlowMountTargets) => (
  <>
    {createPortal(<LogicFlowSidebar />, sidebar)}
    {createPortal(<LogicFlowCanvas />, canvas)}
    {createPortal(<LogicFlowInspector />, inspector)}
    <ConfirmHost />
  </>
);
