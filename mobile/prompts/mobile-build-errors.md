# Mobile Build Error Analysis

When analyzing mobile build errors:

1. Identify the root cause (auth, credentials, SDK, config).
2. Explain what the user needs to do.
3. Provide 1–3 exact commands.
4. Indicate if the fix can run automatically from CAVALLO Studio.
5. Never apply store publishing without explicit user action.

Common patterns:

- Not logged in → `npx expo login`
- Missing Android keystore → `npx eas credentials --platform android`
- Missing EAS config → `npx eas build:configure`
- iOS without Apple account → explain Apple Developer requirement
