const ALLOWED_COMMAND_PATTERNS: RegExp[] = [
  /^npx\s+eas(\s+|$)/i,
  /^npx\s+expo(\s+|$)/i,
  /^npm\s+install$/i,
  /^npm\s+install\s+[@\w][\w@./-]*(?:\s+[@\w][\w@./-]*)*$/i,
  /^npm\s+run\s+[\w:-]+$/i,
  /^npm\s+test$/i,
  /^npm\s+run\s+typecheck$/i,
  /^npm\s+run\s+build$/i,
  /^npm\s+run\s+cicd:test$/i,
  /^git\s+init$/i,
  /^git\s+status$/i,
  /^git\s+add(\s+|$)/i,
  /^git\s+commit(\s+|$)/i
];

export const assertShellCommandAllowed = (command: string): void => {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Empty shell command is not allowed.");
  }
  if (ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return;
  }
  throw new Error(`Shell command blocked by security policy: ${trimmed}`);
};
