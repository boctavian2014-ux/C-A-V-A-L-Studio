import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pill";
}

export const Tabs = ({ tabs, activeId, onChange, variant = "underline" }: TabsProps) => (
  <section className={`caval-tabs caval-tabs--${variant}`}>
    <div role="tablist" className="caval-tabs__list">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeId} className="caval-tabs__tab" onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
    <div className="caval-tabs__panel" role="tabpanel">
      {tabs.find((tab) => tab.id === activeId)?.content}
    </div>
  </section>
);
