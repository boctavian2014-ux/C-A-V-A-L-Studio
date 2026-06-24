import { useState, type ReactNode } from "react";

export interface TabItem {
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultIndex?: number;
  className?: string;
}

export const Tabs = ({ tabs, defaultIndex = 0, className = "" }: TabsProps) => {
  const [active, setActive] = useState(defaultIndex);

  if (tabs.length === 0) {
    return null;
  }

  const safeIndex = Math.min(active, tabs.length - 1);

  return (
    <div className={className}>
      <div className="flex gap-4 border-b border-[var(--pt-border)] mb-4">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(index)}
            className={`pb-2 transition-all ${
              safeIndex === index
                ? "text-[var(--pt-cyan)] border-b-2 border-[var(--pt-cyan)]"
                : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-cyan)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[safeIndex]?.content}</div>
    </div>
  );
};
