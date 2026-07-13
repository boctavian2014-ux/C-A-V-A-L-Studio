export const WELCOME_RECENT_PROJECTS_LABEL = 'proiecte recente';
export const WELCOME_NO_RECENT_PROJECTS = 'Niciun proiect recent';

export function toggleWelcomeRecentList(current: boolean): boolean {
  return !current;
}

export function handleWelcomeCloneKeyDown(
  key: string,
  handlers: { onEnter?: () => void; onEscape?: () => void }
): void {
  if (key === 'Enter') handlers.onEnter?.();
  if (key === 'Escape') handlers.onEscape?.();
}
