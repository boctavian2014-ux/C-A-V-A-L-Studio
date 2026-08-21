/**
 * Legacy path — prefer `XtermTerminal` (wired to `terminal:output`).
 * Kept so historical tests that inspect ResizeObserver order still resolve.
 */
export { XtermTerminal as TerminalSession } from "./XtermTerminal";
export type { XtermTerminalProps as TerminalSessionProps } from "./XtermTerminal";
