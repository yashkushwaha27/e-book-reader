import { useEffect, useState } from "react";

/**
 * True when the viewport is at least `minWidthPx` (typical “desktop web” layout).
 */
export function useDesktopWebBlock(minWidthPx: number): boolean {
  const query = `(min-width: ${minWidthPx}px)`;

  const [blocked, setBlocked] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setBlocked(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return blocked;
}
