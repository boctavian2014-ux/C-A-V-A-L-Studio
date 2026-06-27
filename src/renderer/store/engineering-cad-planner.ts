import type { EngineeringProjectType } from '../components/engineering/engineering-format';
import { inferProjectType } from '../components/engineering/engineering-format';

export type EngineeringCadAction = 'clarify' | 'generate';
export type EngineeringUserLanguage = 'ro' | 'en';

export interface EngineeringCadPlanResult {
  action: EngineeringCadAction;
  userLanguage: EngineeringUserLanguage;
  projectType: EngineeringProjectType;
  technicalPrompt: string;
  assistantMessage?: string;
  questions?: string[];
  quickReplies?: string[];
}

const PART_KEYWORDS =
  /\b(cadru|frame|plate|mount|suport|bracket|landing|gear|elice|prop|propeller|motor mount|bottom plate|top plate|arm|brat|capac|enclosure|cutie|case|hub|roata|wheel|bracket|prindere)\b/i;

const FULL_SYSTEM_KEYWORDS =
  /\b(dron[aă]|drone|fpv|quad|copter|multirotor|robot(?:ic)?|proiect complet|full project|complete system|sistem complet)\b/i;

const ENCLOSURE_ONLY =
  /\b(dulap|cabinet|wardrobe|cutie goal[aă]|hollow box|generic box|simple box)\b/i;

export function detectUserLanguage(text: string): EngineeringUserLanguage {
  const roHints =
    /\b(vreau|dron[aă]|cadru|suport|roata|elice|genereaz[aă]|pies[aă]|mm|inch|găuri|șurub)\b/i;
  return roHints.test(text) ? 'ro' : 'en';
}

export function buildClarifyCadMessage(plan: EngineeringCadPlanResult): string {
  const parts: string[] = [];
  if (plan.assistantMessage) parts.push(plan.assistantMessage);
  if (plan.questions?.length) {
    parts.push(plan.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
  }
  return parts.join('\n\n');
}

export function planEngineeringCad(input: {
  prompt: string;
  projectType: EngineeringProjectType;
}): EngineeringCadPlanResult {
  const prompt = input.prompt.trim();
  const lang = detectUserLanguage(prompt);
  const detectedType = inferProjectType(prompt);
  const projectType =
    input.projectType === 'custom' ? detectedType : input.projectType;

  const wantsFullSystem =
    FULL_SYSTEM_KEYWORDS.test(prompt) && !PART_KEYWORDS.test(prompt);

  if (wantsFullSystem) {
    const isDrone = projectType === 'drone' || /\b(dron|fpv|quad|copter)\b/i.test(prompt);
    return {
      action: 'clarify',
      userLanguage: lang,
      projectType: isDrone ? 'drone' : projectType,
      technicalPrompt: prompt,
      assistantMessage:
        lang === 'ro'
          ? isDrone
            ? 'O dronă completă nu poate fi un singur fișier STL. Generează mai întâi planul hardware, apoi alege o piesă concretă de printat.'
            : 'Un sistem complet nu poate fi un singur STL. Specifică piesa pe care vrei să o printezi.'
          : isDrone
            ? 'A full drone cannot be one STL file. Generate the hardware plan first, then pick a specific printable part.'
            : 'A complete system cannot be one STL. Specify which part you want to print.',
      questions:
        lang === 'ro'
          ? [
              'Ce piesă anume? (cadru, suport motor, landing gear)',
              'Dimensiuni? (ex. cadru 5 inch, găuri M3)',
            ]
          : [
              'Which part? (frame plate, motor mount, landing gear)',
              'Dimensions? (e.g. 5 inch frame, M3 holes)',
            ],
      quickReplies:
        lang === 'ro'
          ? ['Cadru 5 inch bottom plate', 'Suport motor 2207', 'Landing gear 30mm']
          : ['5 inch frame bottom plate', '2207 motor mount', 'Landing gear 30mm'],
    };
  }

  let technicalPrompt = prompt;
  if (ENCLOSURE_ONLY.test(prompt) && projectType === 'drone') {
    technicalPrompt =
      lang === 'ro'
        ? `${prompt} — dronă FPV: model frame plate sau motor mount, NU dulap/cutie generică`
        : `${prompt} — FPV drone: model frame plate or motor mount, NOT generic cabinet/box`;
  }

  return {
    action: 'generate',
    userLanguage: lang,
    projectType,
    technicalPrompt,
  };
}
