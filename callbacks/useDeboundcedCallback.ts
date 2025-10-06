import { debounce } from "@/utils/debounce";
import { useEffect, useMemo, useRef } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  opts?: { leading?: boolean; trailing?: boolean },
  deps: any[] = []
) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  const debounced = useMemo(() => 
    debounce(((...a: any[]) => fnRef.current(...a)) as T, wait, opts),
    // recreate only when timing/behavior or deps change
    [wait, opts?.leading, opts?.trailing, ...deps]
  );

  useEffect(() => () => debounced.cancel(), [debounced]);
  return debounced;
}
