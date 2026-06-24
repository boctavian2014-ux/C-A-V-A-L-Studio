import type { ReactNode } from "react";

export interface ListItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
}

export interface ListProps {
  items: ListItem[];
  dense?: boolean;
  onSelect?: (item: ListItem) => void;
}

export const List = ({ items, dense = false, onSelect }: ListProps) => (
  <ul className={`caval-list ${dense ? "caval-list--dense" : ""}`.trim()}>
    {items.map((item) => (
      <li key={item.id}>
        <button type="button" className="caval-list__item" onClick={() => onSelect?.(item)}>
          {item.icon && <span className="caval-list__icon">{item.icon}</span>}
          <span className="caval-list__content">
            <strong>{item.title}</strong>
            {item.description && <span>{item.description}</span>}
          </span>
          {item.meta && <span className="caval-list__meta">{item.meta}</span>}
        </button>
      </li>
    ))}
  </ul>
);
