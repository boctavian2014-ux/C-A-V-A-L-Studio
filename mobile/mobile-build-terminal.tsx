export interface MobileBuildTerminalProps {
  logs: string[];
  lastError?: string;
}

export const MobileBuildTerminal = ({ logs, lastError }: MobileBuildTerminalProps) => (
  <div className="cs-mobile-terminal">
    <h3>Build output</h3>
    <div className="cs-terminal-body">
      {logs.map((line, index) => (
        <div
          key={`${index}-${line.slice(0, 24)}`}
          className={`cs-terminal-line ${/error|failed/i.test(line) ? "cs-terminal-error" : /success|done/i.test(line) ? "cs-terminal-success" : ""}`}
        >
          {line}
        </div>
      ))}
      {lastError && <div className="cs-terminal-line cs-terminal-error">{lastError}</div>}
    </div>
  </div>
);
