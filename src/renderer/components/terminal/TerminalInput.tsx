import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

interface TerminalInputProps {
  terminalId: string;
  onInput: (data: string) => Promise<void>;
  disabled: boolean;
}

export function TerminalInput({ terminalId, onInput, disabled }: TerminalInputProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [terminalId]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || disabled) return;
    await onInput(`${input}\n`);
    setHistory((prev) => [...prev, input]);
    setHistoryIndex(-1);
    setInput("");
  }, [input, disabled, onInput]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (history.length === 0) return;
        const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex] ?? "");
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex === -1) return;
        const nextIndex = historyIndex + 1;
        if (nextIndex >= history.length) {
          setHistoryIndex(-1);
          setInput("");
          return;
        }
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex] ?? "");
      }
    },
    [handleSubmit, history, historyIndex]
  );

  return (
    <div className="terminal-input-row">
      <span className="terminal-prompt">$</span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="terminal-input"
        placeholder="Type command…"
        aria-label="Terminal input"
        data-testid="terminal-input"
      />
    </div>
  );
}
