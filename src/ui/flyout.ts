// How the interface's flyouts behave, shared: a flyout closes a moment after the pointer leaves it
// (so a slip doesn't lose it), and at once on a click anywhere outside. A native picker (a colour, a
// dropdown) can take the pointer outside; the close waits until it's done.
import { useEffect, useRef, type RefObject } from "react";

export const CLOSE_DELAY = 2500; // ms after the pointer leaves

export function useFlyout(box: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) closeRef.current();
    };
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.clearTimeout(timer.current);
    };
  }, [open, box]);

  return {
    onMouseEnter: () => window.clearTimeout(timer.current),
    onMouseLeave: () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(function check() {
        const el = document.activeElement;
        if (box.current?.contains(el) && (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "color"))) {
          timer.current = window.setTimeout(check, 500);
        } else closeRef.current();
      }, CLOSE_DELAY);
    },
  };
}
