import type { ReactNode } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface SidebarProps {
  items: SidebarItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

export const Sidebar = ({ items, activeId, onSelect }: SidebarProps) => (
  <aside className="caval-sidebar" aria-label="Caval navigation">
    <div className="caval-sidebar__rail" aria-hidden />
    <nav>
      {items.map((item) => (
        <button key={item.id} type="button" className={`caval-sidebar__item ${activeId === item.id ? "is-active" : ""}`.trim()} onClick={() => onSelect?.(item.id)}>
          <span className="caval-sidebar__icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  </aside>
);
