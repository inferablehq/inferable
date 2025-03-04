import { useState, useCallback, useRef } from "react";

function hashValue(value: any): string {
  const str = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

export function useHashState<T>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const lastHashRef = useRef<string>(hashValue(initialValue));

  const setHashState = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      // Handle function updates
      const resolvedValue =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(state)
          : newValue;

      const newHash = hashValue(resolvedValue);

      // Only update if the hash is different
      if (newHash !== lastHashRef.current) {
        lastHashRef.current = newHash;
        setState(resolvedValue);
      }
    },
    [state],
  );

  return [state, setHashState] as const;
}
