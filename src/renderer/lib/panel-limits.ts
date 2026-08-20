export const MAX_TERMINAL_OUTPUT_LINES = 1000;
export const MAX_TERMINAL_SCROLLBACK = 1000;
export const MAX_PREVIEW_LOG_LINES = 200;
export const MAX_TASK_PANEL_LOG_LINES = 200;
export const MAX_OUTPUT_CHANNEL_LINES = 1000;

export const GIT_STATUS_DEBOUNCE_MS = 300;
export const TERMINAL_FIT_DEBOUNCE_MS = 100;
export const TERMINAL_SCROLL_DEBOUNCE_MS = 50;

export function takeLast<T>(items: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  return items.length <= max ? [...items] : items.slice(-max);
}
