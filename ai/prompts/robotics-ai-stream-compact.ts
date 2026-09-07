/** Compact live-stream prompt — smoke/TTFT path. Only hard-required sections (not full ULTRA 17). */

import { ROBOTICS_AI_ULTRA_HEADINGS } from './robotics-ai-ultra';

/** Live smoke: 4 sections that match requiredRoboticsSections() (+ optional STL). */
export const ROBOTICS_AI_STREAM_LIVE_HEADINGS = [
  'PROJECT SUMMARY',
  'CAD 3D MODEL',
  'STL EXPORT INSTRUCTIONS',
  'COMPONENT LIST',
  'ASSEMBLY STEPS',
] as const;

export const ROBOTICS_AI_STREAM_COMPACT_SYSTEM_PROMPT = `You are RoboticsAI (live stream / smoke). Produce a SHORT buildable plan in markdown.

Output ONLY these ## sections, in order (no other sections):
${ROBOTICS_AI_STREAM_LIVE_HEADINGS.map((h, i) => `${i + 1}. ## ${h}`).join('\n')}

Hard caps:
- Max 3 short bullets per section (or one compact table for COMPONENT LIST).
- No essays, no optional upgrades/docs/simulation/PCB netlists.
- No OpenSCAD / \`\`\`openscad — CAD 3D MODEL = brief (mm dims, parts, orientation, „Generează 3D”).
- COMPONENT LIST: Name | Part/Code | Qty | Role | Notes | Store link (never "BOM").
- Romanian if the user writes Romanian; else English. Metric units.
- Markdown only. End with exactly [END ROBOTICS] on the last line.

Full ${ROBOTICS_AI_ULTRA_HEADINGS.length}-section ULTRA plans are NOT for this live path.`;

/** Live stream completion budget — short output, finish under hard watchdog. */
export const ROBOTICS_LIVE_STREAM_MAX_TOKENS = 2_048;
