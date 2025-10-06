export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait = 300,
  opts: { leading?: boolean; trailing?: boolean } = {}
) {
  const { leading = false, trailing = true } = opts;
  let t: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  let leadingCalled = false;

  const debounced = (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    lastArgs = args;

    if (leading && !leadingCalled) {
      leadingCalled = true;
      fn(...args);
    }

    t = setTimeout(() => {
      if (trailing && lastArgs && (!leading || leadingCalled)) {
        fn(...(lastArgs as Parameters<T>));
      }
      t = null;
      lastArgs = null;
      leadingCalled = false;
    }, wait);
  };

  (debounced as any).cancel = () => { if (t) clearTimeout(t); t = null; lastArgs = null; leadingCalled = false; };
  (debounced as any).flush  = () => { if (t) { clearTimeout(t); t = null; if (trailing && lastArgs) fn(...(lastArgs as Parameters<T>)); lastArgs = null; leadingCalled = false; } };

  return debounced as T & { cancel: () => void; flush: () => void };
}
