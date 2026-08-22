export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
};

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wrapped = ((...args: Args) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }) as Debounced<Args>;

  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped;
}
