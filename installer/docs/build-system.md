# Build System Architecture

Caval Studio uses Electron, TypeScript, Webpack and electron-builder for cross-platform packaging.

## Pipeline

```mermaid
flowchart TD
  Source[Source Code] --> Typecheck[npm run typecheck]
  Typecheck --> Webpack[npm run build]
  Webpack --> Builder[electron-builder]
  Builder --> Win[Windows: NSIS + MSI]
  Builder --> Mac[macOS: DMG + PKG]
  Builder --> Linux[Linux: deb + rpm + AppImage]
  Win --> SignWin[EV Code Signing]
  Mac --> SignMac[Developer ID Signing]
  SignMac --> Notarize[Apple Notarization]
  SignWin --> Publish[Publish Release]
  Notarize --> Publish
  Linux --> Publish
  Publish --> Feeds[Stable/Beta/Nightly Feeds]
```

## CI/CD

Recommended stages:

1. Install dependencies.
2. Typecheck.
3. Build Webpack bundles.
4. Package per platform.
5. Sign artifacts.
6. Notarize macOS artifacts.
7. Generate update feeds.
8. Publish GitHub/S3/custom release.
9. Smoke test update feed.

## Release Channels

```mermaid
flowchart LR
  Main[main branch] --> Stable[stable]
  Release[release/*] --> Beta[beta]
  NightlyBranch[nightly/main schedule] --> Nightly[nightly]
  Stable --> StableFeed[updates.caval.studio/stable]
  Beta --> BetaFeed[updates.caval.studio/beta]
  Nightly --> NightlyFeed[updates.caval.studio/nightly]
```

## Platform Targets

- Windows: `.exe`, `.msi`, NSIS installer.
- macOS: `.dmg`, `.pkg`, hardened runtime, notarization.
- Linux: `.deb`, `.rpm`, `.AppImage`.

## Security

- Windows EV certificate signing.
- macOS Developer ID Application signing.
- Apple notarization.
- SHA512 release feed verification.
- Signed auto-update verification.

## Delta Updates

`installer/updater/delta-generator.ts` provides the delta manifest scaffold. Production should replace the placeholder XOR algorithm with a battle-tested binary diff format such as bsdiff, Courgette-style delta, or provider-native differential updates.
