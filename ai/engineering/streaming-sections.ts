// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — incremental section collector (pure)
//
//  Consumă bucăți (chunks) de markdown pe măsură ce sosesc dintr-un
//  stream LLM și expune secțiunile deja formate, fără a aștepta
//  întregul plan. O secțiune e considerată `complete` doar când apare
//  următorul heading sau când stream-ul se încheie (`finish()`); până
//  atunci rămâne `generating`. Modul PUR: fără React, fără `window`,
//  fără efecte — poate fi testat izolat și refolosit de UI/generator.
//
//  Reutilizează exact logica de heading-uri din `robotics-format`
//  (`matchSectionKey`, cu toate alias-urile RO/EN) — o singură sursă
//  de adevăr, fără duplicarea tabelului de alias-uri.
// ──────────────────────────────────────────────────────────────

import { matchSectionKey, type RoboticsSectionKey } from './robotics-format';

export type StreamingSectionStatus = 'generating' | 'complete';

export interface StreamingSection {
  /** Cheia canonică (ex. `cad`, `partsList`) sau `other` pentru heading-uri necunoscute. */
  key: RoboticsSectionKey;
  /** Textul heading-ului, fără `#`-uri (ex. „CAD 3D Model"). Gol pentru preambul. */
  heading: string;
  /** Corpul acumulat al secțiunii, fără linia de heading. */
  content: string;
  status: StreamingSectionStatus;
}

export interface SectionStreamSnapshot {
  sections: StreamingSection[];
  /** Cheia secțiunii care se generează acum, sau `null`. */
  activeKey: RoboticsSectionKey | null;
  /** Secțiuni finalizate (status `complete`). */
  completed: number;
  /** Total secțiuni descoperite până acum. */
  total: number;
}

export interface SectionCollector {
  /** Adaugă o bucată de stream; întoarce snapshot-ul curent. */
  push(chunk: string): SectionStreamSnapshot;
  /** Marchează sfârșitul stream-ului: flush + toate secțiunile devin `complete`. */
  finish(): SectionStreamSnapshot;
  /** Golește tot (abort / regenerare). */
  reset(): void;
  /** Snapshot fără a muta starea. */
  snapshot(): SectionStreamSnapshot;
}

interface MutableSection {
  key: RoboticsSectionKey;
  heading: string;
  lines: string[];
  status: StreamingSectionStatus;
}

/** O linie completă e heading dacă e recunoscută SAU are forma markdown `#{1,3} …`. */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^#{1,3}\s+\S/.test(trimmed)) return true;
  return matchSectionKey(line) !== null;
}

function headingText(line: string): string {
  return line.trim().replace(/^#{1,3}\s*/, '').trim();
}

/** Un tail incomplet care ar putea deveni heading nu trebuie afișat ca și corp. */
function looksLikeHeadingStart(pending: string): boolean {
  return pending.trimStart().startsWith('#');
}

/**
 * Împarte buffer-ul în linii complete + un rest neterminat.
 * Tratează `\n`, `\r\n` și `\r` singur; un `\r` la finalul buffer-ului
 * (posibil jumătate dintr-un `\r\n` tăiat între chunk-uri) rămâne în rest.
 */
function drainLines(buf: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let i = 0;
  let start = 0;
  while (i < buf.length) {
    const c = buf[i];
    if (c === '\n') {
      lines.push(buf.slice(start, i));
      i += 1;
      start = i;
    } else if (c === '\r') {
      if (i === buf.length - 1) break; // \r la final: poate fi început de \r\n
      lines.push(buf.slice(start, i));
      i += buf[i + 1] === '\n' ? 2 : 1;
      start = i;
    } else {
      i += 1;
    }
  }
  return { lines, rest: buf.slice(start) };
}

export function createSectionCollector(): SectionCollector {
  let closed: MutableSection[] = [];
  let current: MutableSection | null = null;
  let pending = '';

  function ensureCurrent(): MutableSection {
    if (!current) {
      current = { key: 'other', heading: '', lines: [], status: 'generating' };
    }
    return current;
  }

  function openSection(line: string): void {
    if (current) {
      current.status = 'complete';
      closed.push(current);
    }
    current = {
      key: matchSectionKey(line) ?? 'other',
      heading: headingText(line),
      lines: [],
      status: 'generating',
    };
  }

  function consumeLine(line: string): void {
    if (isHeadingLine(line)) {
      openSection(line);
    } else {
      ensureCurrent().lines.push(line);
    }
  }

  function build(): SectionStreamSnapshot {
    const sections: StreamingSection[] = [];
    const pushSection = (s: MutableSection, tail: string): void => {
      const body = tail ? [...s.lines, tail] : s.lines;
      sections.push({
        key: s.key,
        heading: s.heading,
        content: body.join('\n').trim(),
        status: s.status,
      });
    };
    for (const s of closed) pushSection(s, '');
    if (current) {
      // Tail-ul neterminat aparține secțiunii curente doar dacă nu e un heading în formare.
      const tail = pending && !looksLikeHeadingStart(pending) ? pending : '';
      pushSection(current, tail);
    }
    const completed = sections.filter((s) => s.status === 'complete').length;
    return {
      sections,
      activeKey: current ? current.key : null,
      completed,
      total: sections.length,
    };
  }

  return {
    push(chunk: string): SectionStreamSnapshot {
      pending += chunk;
      const { lines, rest } = drainLines(pending);
      pending = rest;
      for (const line of lines) consumeLine(line);
      return build();
    },
    finish(): SectionStreamSnapshot {
      const rest = pending;
      pending = '';
      if (rest.length > 0) {
        if (isHeadingLine(rest)) openSection(rest);
        else ensureCurrent().lines.push(rest);
      }
      if (current) {
        current.status = 'complete';
        closed.push(current);
        current = null;
      }
      const snap = build();
      return { ...snap, activeKey: null };
    },
    reset(): void {
      closed = [];
      current = null;
      pending = '';
    },
    snapshot(): SectionStreamSnapshot {
      return build();
    },
  };
}

/** Comoditate: colectează tot textul dintr-o dată (fallback non-stream). */
export function collectSections(fullText: string): StreamingSection[] {
  const c = createSectionCollector();
  c.push(fullText);
  return c.finish().sections;
}
