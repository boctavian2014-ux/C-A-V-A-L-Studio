const DEV_MODE_ENV = process.env.CAVAL_DEVELOPER_MODE === "1";

let developerModeEnabled = DEV_MODE_ENV;

export const isDeveloperModeEnabled = (): boolean => developerModeEnabled;

export const setDeveloperMode = (enabled: boolean, unlockToken?: string): boolean => {
  const expected = process.env.CAVAL_DEVELOPER_UNLOCK_TOKEN;
  if (enabled && expected && unlockToken !== expected) {
    return false;
  }
  developerModeEnabled = enabled;
  return true;
};

export const resetDeveloperModeForTests = (enabled = false): void => {
  developerModeEnabled = enabled;
};

export const assertDeveloperMode = (): void => {
  if (!developerModeEnabled) {
    throw new Error("Developer mode is disabled.");
  }
};
