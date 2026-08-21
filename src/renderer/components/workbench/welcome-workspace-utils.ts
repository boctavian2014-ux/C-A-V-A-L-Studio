/** @deprecated Prefer welcome.* i18n keys — kept for unit tests / legacy imports. */
export const WELCOME_RECENT_PROJECTS_LABEL = "Recent projects";
/** @deprecated Prefer welcome.noRecent i18n key. */
export const WELCOME_NO_RECENT_PROJECTS = "No recent projects";

export function toggleWelcomeRecentList(current: boolean): boolean {
  return !current;
}

export function handleWelcomeCloneKeyDown(
  key: string,
  handlers: { onEnter?: () => void; onEscape?: () => void }
): void {
  if (key === "Enter") handlers.onEnter?.();
  if (key === "Escape") handlers.onEscape?.();
}
