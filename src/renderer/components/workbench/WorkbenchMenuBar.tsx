import React, { useCallback, useEffect, useState } from "react";

type MenuTopLevel = { index: number; label: string };

export function WorkbenchMenuBar() {
  const appMenu = typeof window !== "undefined" ? window.caval?.appMenu : undefined;
  const enabled = appMenu?.usesInRendererBar === true;
  const [items, setItems] = useState<MenuTopLevel[]>([]);

  useEffect(() => {
    if (!enabled || !appMenu?.topLevel) return;
    let cancelled = false;
    void appMenu.topLevel().then((next) => {
      if (!cancelled && Array.isArray(next)) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, appMenu]);

  const onOpen = useCallback(
    (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      void appMenu?.popup?.({ index, x: rect.left, y: rect.bottom });
    },
    [appMenu],
  );

  if (!enabled || items.length === 0) return null;

  return (
    <nav
      className="workbench-menubar"
      data-testid="workbench-menubar"
      aria-label="Application"
    >
      {items.map((item) => (
        <button
          key={`${item.index}-${item.label}`}
          type="button"
          className="workbench-menubar-item"
          onClick={(event) => onOpen(item.index, event)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
