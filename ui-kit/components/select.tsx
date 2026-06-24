import { useMemo, useState, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  options: SelectOption[];
  searchable?: boolean;
}

export const Select = ({ label, options, searchable = false, className = "", ...props }: SelectProps) => {
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())), [options, query]);

  return (
    <label className={`caval-field ${className}`.trim()}>
      {label && <span className="caval-field__label">{label}</span>}
      {searchable && (
        <input className="caval-input caval-input--select-search" placeholder="Filter options..." value={query} onChange={(event) => setQuery(event.target.value)} />
      )}
      <select className="caval-select" {...props}>
        {filteredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
};
