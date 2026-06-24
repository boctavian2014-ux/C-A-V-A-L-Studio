# Mobile Build Panel

Caval Studio's **Mobile Build Panel** lets developers publish Android and iOS apps via Expo EAS directly from the IDE — with live terminal output, step tracking, tutorial guidance, and AI-powered build error explanation.

## Architecture

```mermaid
flowchart LR
  user[User] --> panel[MobileBuildPanel]
  panel --> ipc[Electron IPC]
  ipc --> runner[MobileBuildRunner]
  runner --> expo[Expo EAS CLI]
  expo --> output[BuildOutput]
  output --> agent[MobileBuildAgent]
  agent --> chat[ComposerChat]
```

## Module structure

| File | Responsibility |
|------|----------------|
| `mobile-build-store.ts` | Build state machine, steps, logs |
| `mobile-build-service.ts` | Platform commands, Expo project detection |
| `mobile-build-agent.ts` | Error heuristics + AI explanation via DebugAgent |
| `mobile-build-runner.ts` | Child process execution, stream handling |
| `mobile-build-api.ts` | Facade for store/service/agent |
| `mobile-build-panel.tsx` | React UI (architecture / future mount) |

## Accounts required

- **Expo.dev** — cloud builds
- **Google Play Developer** — $25 one-time (Android publishing)
- **Apple Developer** — $99/year (iOS publishing)

## Recommended commands

```bash
npx expo login
npx expo doctor
npx eas build --platform android
npx eas build --platform ios
npx eas update --auto
```

## IPC API

| Channel | Purpose |
|---------|---------|
| `caval:mobile-build-start` | Start build for platform |
| `caval:mobile-build-cancel` | Cancel running build |
| `caval:mobile-build-fix` | Run AI-suggested fix command |
| `caval:mobile-build-data` | Stream stdout/stderr lines |
| `caval:mobile-build-error` | AI error analysis payload |
| `caval:mobile-build-complete` | Build finished |

## UI access

- Activity bar: **Build Mobile App** (replaces Search button)
- Search: Command Palette only (`Ctrl+K` → Search in Workspace)

## AI integration

`MobileBuildAgent` detects common Expo/EAS errors and uses `DebugAgent` for natural-language explanations and fix commands. Errors appear in the Mobile Build panel and Composer chat.
