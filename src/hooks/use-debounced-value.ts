"use client";

/**
 * useDebouncedValue — returns a value that updates only after `delay` ms
 * of no changes. Used for search inputs to avoid firing a query on every keystroke.
 */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
