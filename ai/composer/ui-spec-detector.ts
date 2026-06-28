const UI_SPEC_PATTERNS = [
  /\bdark\s*mode\b/i,
  /\blight\s*mode\b/i,
  /\btailwind\b/i,
  /\bshadcn\b/i,
  /\bmaterial\s*ui\b/i,
  /\bmui\b/i,
  /\bchakra\b/i,
  /\bant\s*design\b/i,
  /\bbootstrap\b/i,
  /\bwireframe\b/i,
  /\bui\s*\/\s*ux\b/i,
  /\buser\s*interface\b/i,
  /\bfrontend\s*design\b/i,
  /\bcolor\s*scheme\b/i,
  /\bpalet[aă]\s*(de\s*)?culori/i,
  /\bculor(i|ile)\s*(principal|accent)/i,
  /\blayout\b/i,
  /\bsidebar\b/i,
  /\bnavbar\b/i,
  /\bdashboard\s*design\b/i,
  /\bminimal(ist)?\s*(ui|design)?\b/i,
  /\bmodern\s*(ui|design)\b/i,
  /\bglassmorphism\b/i,
  /\bneumorphism\b/i,
  /\bcomponent\s*library\b/i,
  /\bfigma\b/i,
  /\bresponsive\s*design\b/i,
  /\bmobile\s*first\b/i,
];

/** True when the user prompt already specifies UI/design preferences. */
export function hasUiSpecInPrompt(message: string): boolean {
  const t = message.trim();
  if (t.length < 8) return false;
  return UI_SPEC_PATTERNS.some((re) => re.test(t));
}

/** True when a pipeline task is UI/frontend design work. */
export function isUiDesignTask(task: { module?: string; description?: string; phase?: string }): boolean {
  if (task.phase === 'ui') return true;
  const blob = `${task.module ?? ''} ${task.description ?? ''}`.toLowerCase();
  return /\b(ui|ux|frontend|interface|design|shell|components?|layout|dashboard)\b/.test(blob);
}

export function partitionTasksByUiPhase<T extends { phase?: string; module?: string; description?: string }>(
  tasks: T[]
): { preUi: T[]; ui: T[]; postUi: T[] } {
  const ui: T[] = [];
  const nonUi: T[] = [];
  for (const t of tasks) {
    if (isUiDesignTask(t)) ui.push(t);
    else nonUi.push(t);
  }
  return { preUi: nonUi, ui, postUi: [] };
}
