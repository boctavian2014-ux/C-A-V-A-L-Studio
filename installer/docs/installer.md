# CAVALLO Studio Installer

## Release local Windows (recommended)

From the Cavallo Studio repo root (`caval studio`):

```bash
# Full pipeline: preflight → typecheck → test → build → dist:win → sign (optional) → report
CAVAL_RELEASE_CHANNEL=stable npm run release:win
```

Preflight only:

```bash
npm run release:preflight
npm run release:preflight -- --phase=post-build
```

### Output

Artifacts land in `release/<channel>/`:

- `CAVALLO-<version>-win-x64.exe` (NSIS wizard installer)
- `CAVALLO-<version>-win-x64.msi`
- `release-report.json` — step timings, SHA256 hashes, signed flag

### Environment variables

| Variable | Purpose |
|---|---|
| `CAVAL_RELEASE_CHANNEL` | `stable` (default), `beta`, or `nightly` |
| `CAVAL_WIN_CERT_SHA1` | Thumbprint for `signtool` (preferred) |
| `CAVAL_WIN_CERT_FILE` | `.pfx` path when SHA1 not used |
| `CAVAL_WIN_CERT_PASSWORD` | PFX password |

Unsigned builds are valid for local development. Configure a certificate for production releases.

### Cavallo Release mode

In the IDE, select **Release** mode (or type `RELEASE MODE`). The agent orchestrates real scripts (`release:win`, `release:preflight`) and reads `release-report.json` — it does not generate installers from chat.

## Build Commands

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
npm run dist:all
```

Set release channel:

```bash
CAVAL_RELEASE_CHANNEL=stable npm run dist:all
CAVAL_RELEASE_CHANNEL=beta npm run dist:all
CAVAL_RELEASE_CHANNEL=nightly npm run dist:all
```

## Code Signing

### Windows

Configure EV certificate:

- `CAVAL_WIN_CERT_SHA1` or `CAVAL_WIN_CERT_FILE`
- `CAVAL_WIN_CERT_PASSWORD`

Manual signing:

```bash
tsx installer/scripts/sign-windows.ts release/stable/Caval-Studio.exe
```

### macOS

Configure:

- `CAVAL_MAC_DEVELOPER_ID`
- `CAVAL_APPLE_ID`
- `CAVAL_APPLE_TEAM_ID`
- `CAVAL_APPLE_APP_PASSWORD`

Manual signing:

```bash
tsx installer/scripts/sign-macos.ts "release/stable/mac/CAVALLO Studio.app"
tsx installer/scripts/notarize-macos.ts release/stable/Caval-Studio.dmg
```

## Publish Releases

```bash
GITHUB_TOKEN=... CAVAL_RELEASE_CHANNEL=stable npm run release:publish
```

Publish targets are configured in `installer/config/electron-builder.yml`:

- GitHub Releases
- S3
- Generic custom update server

## Auto-Update

`installer/updater/auto-updater.ts` uses `electron-updater`:

1. Check feed.
2. Ask user to download.
3. Download update.
4. Ask for restart.
5. Quit and install.

```mermaid
sequenceDiagram
  participant App
  participant Feed
  participant User
  participant Updater

  App->>Feed: checkForUpdates
  Feed-->>App: latest version
  App->>User: prompt download
  User-->>Updater: accept
  Updater->>Feed: download artifact/delta
  Updater->>User: prompt restart
  User-->>Updater: restart
  Updater->>App: quitAndInstall
```

## Release Channels

- Stable: production users.
- Beta: early adopters.
- Nightly: internal/high-frequency builds.

Each channel has an independent release folder and feed.

## Crash Reporting

`installer/updater/crash-reporter.ts` supports Sentry-compatible or custom crash upload endpoints.
