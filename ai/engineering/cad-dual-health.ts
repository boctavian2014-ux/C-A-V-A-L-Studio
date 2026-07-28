/** Dual Local (app secrets) vs Cloud (/health) status for CAD keys. */

export type CadDualHealthInput = {
  localOpenRouter: boolean;
  localPiapi: boolean;
  cloudOk: boolean;
  cloudUrl?: string;
  cloudOpenRouter?: boolean;
  cloudPiapi?: boolean;
  openscadInstalled?: boolean;
  cloudError?: string;
};

export type CadDualHealthResult = {
  text: string;
  /** ok = both local+cloud keys; warn = cloud online but env gap; err = offline/fail */
  tone: 'ok' | 'warn' | 'err';
};

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function formatCadDualHealth(input: CadDualHealthInput): CadDualHealthResult {
  if (!input.cloudOk) {
    return {
      tone: 'err',
      text:
        input.cloudError?.trim() ||
        `Offline: ${input.cloudUrl ?? '?'}. Verifică URL în Setări → CAD Cloud 3D.`,
    };
  }

  const localLine = `Local OR${mark(input.localOpenRouter)} PiAPI${mark(input.localPiapi)}`;
  const cloudLine = `Cloud OR${mark(Boolean(input.cloudOpenRouter))} PiAPI${mark(Boolean(input.cloudPiapi))}`;
  const scad = `OpenSCAD${mark(Boolean(input.openscadInstalled))}`;
  const base = `Conectat: ${input.cloudUrl ?? '?'}\n${localLine} · ${cloudLine} · ${scad}`;

  const cloudKeysOk = Boolean(input.cloudOpenRouter) && Boolean(input.cloudPiapi);
  const localKeysOk = input.localOpenRouter && input.localPiapi;
  const bothOk = cloudKeysOk && localKeysOk && Boolean(input.openscadInstalled);

  if (bothOk) {
    return { tone: 'ok', text: base };
  }

  const hints: string[] = [];
  if (!input.localOpenRouter || !input.localPiapi) {
    hints.push('Local: setează OpenRouter + PiAPI Trellis în AI & Chei API, apoi repornește app-ul.');
  }
  if (!input.cloudOpenRouter || !input.cloudPiapi) {
    hints.push(
      'Cloud: pe Railway lipsește env — pune OPENROUTER_API_KEY + PIAPI_API_KEY în Variables. Cheile din app se trimit pe job, dar /health arată doar env-ul cloud.'
    );
  }
  if (!input.openscadInstalled) {
    hints.push('OpenSCAD lipsește pe serverul CAD — verifică Dockerfile / deploy.');
  }

  return {
    tone: 'warn',
    text: `${base}${hints.length ? `\n${hints.join(' ')}` : ''}`,
  };
}

/** One-line summary for compact UI (ApiKeysForm). */
export function formatCadDualHealthOneLine(input: CadDualHealthInput): CadDualHealthResult {
  const full = formatCadDualHealth(input);
  if (full.tone === 'err') return full;
  const local = `Local OR${mark(input.localOpenRouter)} PiAPI${mark(input.localPiapi)}`;
  const cloud = `Cloud OR${mark(Boolean(input.cloudOpenRouter))} PiAPI${mark(Boolean(input.cloudPiapi))}`;
  const scad = `OpenSCAD${mark(Boolean(input.openscadInstalled))}`;
  return {
    tone: full.tone,
    text: `${local} · ${cloud} · ${scad}`,
  };
}
