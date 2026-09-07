export function debounceUnlessCancelled(
  ms: number,
  token: {
    isCancellationRequested: boolean;
    onCancellationRequested?: (listener: () => void) => { dispose: () => void };
  }
): Promise<boolean> {
  if (token.isCancellationRequested) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      disposable?.dispose();
      resolve(!token.isCancellationRequested);
    }, ms);
    const disposable = token.onCancellationRequested?.(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
