import { DebugAgent } from "../ai/agents/debug";
import type { MobileBuildErrorAnalysis } from "./types";

interface ErrorPattern {
  id: string;
  regex: RegExp;
  explanation: string;
  commands: string[];
  canAutoFix: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    id: "expo-not-logged-in",
    regex: /must be logged in|not logged in|authentication required/i,
    explanation: "You must be logged in to Expo.dev before running cloud builds.",
    commands: ["npx expo login"],
    canAutoFix: true
  },
  {
    id: "apple-developer",
    regex: /apple developer|apple id|ios credentials/i,
    explanation: "iOS builds require an Apple Developer account and valid credentials.",
    commands: ["npx eas credentials --platform ios"],
    canAutoFix: false
  },
  {
    id: "android-keystore",
    regex: /keystore|credentials.*android|no credentials found/i,
    explanation: "Android signing credentials are missing. Configure them with EAS credentials manager.",
    commands: ["npx eas credentials --platform android"],
    canAutoFix: true
  },
  {
    id: "android-sdk",
    regex: /android sdk|sdk not found|adb/i,
    explanation: "Android SDK tools are missing. Install Android Studio or platform-tools.",
    commands: ['sdkmanager --install "platform-tools"'],
    canAutoFix: false
  },
  {
    id: "eas-missing",
    regex: /eas\.json|eas cli|not found.*eas/i,
    explanation: "EAS configuration is missing. Initialize EAS for this project.",
    commands: ["npx eas build:configure"],
    canAutoFix: true
  },
  {
    id: "expo-not-installed",
    regex: /expo.*not found|cannot find module.*expo/i,
    explanation: "Expo dependencies are not installed in this workspace.",
    commands: ["npm install expo eas-cli"],
    canAutoFix: true
  }
];

export class MobileBuildAgent {
  constructor(private readonly debug = new DebugAgent()) {}

  detectError(line: string): MobileBuildErrorAnalysis | null {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(line)) {
        return {
          matched: true,
          pattern: pattern.id,
          explanation: pattern.explanation,
          suggestedCommands: pattern.commands,
          canAutoFix: pattern.canAutoFix
        };
      }
    }

    if (/error:|failed|fatal/i.test(line)) {
      return {
        matched: true,
        explanation: "A build error was detected in the mobile build output.",
        suggestedCommands: ["npx expo doctor"],
        canAutoFix: false
      };
    }

    return null;
  }

  async analyzeWithAI(logs: string[], errorLine: string): Promise<MobileBuildErrorAnalysis> {
    const heuristic = this.detectError(errorLine);
    if (heuristic?.pattern && heuristic.pattern !== undefined) {
      try {
        const explanation = await this.debug.diagnose([
          { source: "runtime", message: errorLine, file: "mobile-build" }
        ]);
        const fix = await this.debug.suggestFix(
          [{ source: "runtime", message: logs.slice(-20).join("\n"), file: "mobile-build" }],
          []
        );
        return {
          matched: true,
          pattern: heuristic.pattern,
          explanation: `${heuristic.explanation}\n\n${explanation}`,
          suggestedCommands: heuristic.suggestedCommands.length > 0
            ? heuristic.suggestedCommands
            : this.extractCommandsFromText(fix),
          canAutoFix: heuristic.canAutoFix
        };
      } catch {
        return heuristic;
      }
    }

    return heuristic ?? {
      matched: false,
      explanation: "No actionable mobile build error detected.",
      suggestedCommands: [],
      canAutoFix: false
    };
  }

  handleBuildOutput(line: string, logs: string[]): MobileBuildErrorAnalysis | null {
    return this.detectError(line);
  }

  private extractCommandsFromText(text: string): string[] {
    const matches = text.match(/`([^`]+)`|npx [^\n]+|eas [^\n]+/g) ?? [];
    return matches.map((m) => m.replace(/`/g, "").trim()).slice(0, 3);
  }
}
