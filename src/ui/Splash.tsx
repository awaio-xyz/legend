// The splash: on opening, the mark draws itself (the egg, then the head, heart and gut lighting in
// turn) above the word LEGEND in widely spaced mono, then everything fades to the figure. A click
// skips it.
import { useEffect, useState } from "react";

const HOLD_MS = 3000; // on screen before fading
const FADE_MS = 900;
/** When the app builds the figure: once the mark has drawn itself, so the build happens behind it. */
export const SPLASH_BUILD_AT = 1900;

export function Splash() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");
  useEffect(() => {
    // Timed from the first frame actually painted, not from mounting.
    let out = 0, gone = 0;
    const raf = requestAnimationFrame(() => {
      out = window.setTimeout(() => setPhase("out"), HOLD_MS);
      gone = window.setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(out);
      window.clearTimeout(gone);
    };
  }, []);
  if (phase === "gone") return null;
  return (
    <div className={`splash ${phase}`} onClick={() => setPhase("gone")}>
      <svg className="splash-mark" viewBox="0 0 1024 1024" aria-hidden>
        <defs>
          <radialGradient id="splash-glow">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.18" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse className="splash-egg" cx="512" cy="530" rx="268" ry="372" fill="none" stroke="#8a8a8a" strokeWidth="10" pathLength={1} />
        <circle className="splash-dot d1" cx="512" cy="330" r="118" fill="url(#splash-glow)" />
        <circle className="splash-dot d2" cx="474" cy="530" r="96" fill="url(#splash-glow)" />
        <circle className="splash-dot d3" cx="512" cy="716" r="108" fill="url(#splash-glow)" />
      </svg>
      <div className="splash-word">LEGEND</div>
    </div>
  );
}
