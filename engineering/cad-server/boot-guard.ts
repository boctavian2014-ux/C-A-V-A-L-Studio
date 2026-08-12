/**
 * Production CAD cloud must not boot with anonymous auth.
 * Local Electron CAD (CAD_USE_LOCAL=1) is not the production cloud.
 */
export const isCadProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production" && process.env.CAD_USE_LOCAL !== "1";

export const isCadAnonymousAllowed = (): boolean =>
  process.env.CAD_ALLOW_ANONYMOUS === "1";

export function assertCadProductionSafety(): void {
  if (isCadProductionRuntime() && isCadAnonymousAllowed()) {
    throw new Error(
      "CAD_ALLOW_ANONYMOUS=1 is forbidden when NODE_ENV=production. Disable anonymous auth for CAD cloud."
    );
  }
}
