import { useEffect, useRef } from "react";

/**
 * Custom hook for setting up an interval that is properly cleaned up when the component unmounts
 * @param callback Function to be called on each interval
 * @param delay Delay in milliseconds. If null, the interval is paused
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);

    // Cleanup on unmount or when delay changes
    return () => clearInterval(id);
  }, [delay]);
}
