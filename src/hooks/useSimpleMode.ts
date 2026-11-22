import { useEffect, useState } from "react";

const KEY = "lsfg-simple-mode-v1";
const EVENT = "lsfg-simple-mode-changed";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

/** Simple mode shows only the basics (multiplier, Flow Scale, Performance Mode). Shared across tabs. */
export function useSimpleMode(): readonly [boolean, (value: boolean) => void] {
  const [simple, setSimple] = useState(read);

  useEffect(() => {
    const sync = () => setSimple(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const update = (value: boolean) => {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {}
    setSimple(value);
    window.dispatchEvent(new Event(EVENT));
  };

  return [simple, update] as const;
}
