import fs from "node:fs";
import path from "node:path";
import type { ExpoProjectInfo, MobileBuildCommand, MobilePlatform } from "./types";

const CONFIG_CANDIDATES = ["app.json", "app.config.js", "app.config.ts", "eas.json", "package.json"];

export class MobileBuildService {
  detectExpoProject(workspaceRoot: string): ExpoProjectInfo {
    const configFiles = CONFIG_CANDIDATES.filter((file) =>
      fs.existsSync(path.join(workspaceRoot, file))
    );
    const hasAppConfig = configFiles.some((f) => f.startsWith("app."));
    const hasEasConfig = configFiles.includes("eas.json");
    const packageJsonPath = path.join(workspaceRoot, "package.json");
    let isExpo = hasAppConfig || hasEasConfig;

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        isExpo = isExpo || Boolean(deps?.expo || deps?.["expo-router"]);
      } catch {
        // ignore invalid package.json
      }
    }

    return { isExpo, hasAppConfig, hasEasConfig, configFiles };
  }

  getCommands(platform: MobilePlatform, workspaceRoot: string): MobileBuildCommand[] {
    const project = this.detectExpoProject(workspaceRoot);
    const commands: MobileBuildCommand[] = [
      { stepId: "env", command: "node --version", shell: true },
      { stepId: "login", command: "npx expo whoami", shell: true }
    ];

    if (project.isExpo) {
      commands.push({ stepId: "prepare", command: "npx expo doctor", shell: true });
    } else {
      commands.push({
        stepId: "prepare",
        command: "echo No Expo project detected. Add app.json or run: npx create-expo-app@latest .",
        shell: true
      });
    }

    if (platform === "android") {
      commands.push({
        stepId: "build",
        command: "npx eas build --platform android --non-interactive",
        shell: true
      });
    } else if (platform === "ios") {
      commands.push({
        stepId: "build",
        command: "npx eas build --platform ios --non-interactive",
        shell: true
      });
    } else {
      commands.push({
        stepId: "build",
        command: "npx eas update --auto",
        shell: true
      });
    }

    commands.push(
      { stepId: "upload", command: "echo Upload via Google Play Console or App Store Connect after build completes.", shell: true },
      { stepId: "publish", command: "echo Publish when store metadata and review are ready.", shell: true }
    );

    return commands;
  }

  extractBuildUrl(line: string): string | undefined {
    const urlMatch = /https?:\/\/expo\.dev\/[^\s]+/i.exec(line);
    return urlMatch?.[0];
  }
}
