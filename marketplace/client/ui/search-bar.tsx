export interface SearchBarProps {
  query: string;
  suggestions: string[];
  onChange: (query: string) => void;
  onSubmit?: (query: string) => void;
}

export const SearchBar = ({ query, suggestions, onChange, onSubmit }: SearchBarProps) => (
  <form className="marketplace-search" onSubmit={(event) => {
    event.preventDefault();
    onSubmit?.(query);
  }}>
    <input
      aria-label="Caută extensii"
      placeholder="Caută extensii…"
      value={query}
      onChange={(event) => onChange(event.target.value)}
    />
    <button type="submit">Search</button>
    {suggestions.length > 0 && (
      <ul className="marketplace-search__suggestions">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button type="button" onClick={() => onChange(suggestion)}>{suggestion}</button>
          </li>
        ))}
      </ul>
    )}
  </form>
);
