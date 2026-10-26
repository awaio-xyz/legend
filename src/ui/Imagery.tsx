// Imagery: the camera button in the lower right. Asks first, then for a folder, then renders ten
// stills of the figure (different angles, lenses and poses, from engine/imagery.ts) and saves them
// there as JPEGs, ready to share.
import { useEffect, useRef, useState } from "react";
import type { LegendEngine } from "../engine/legend";
import { SHOTS, IMAGE_SIZE } from "../engine/imagery";
import { inDesktop } from "./desktop";
import { invoke } from "@tauri-apps/api/core";

type Stage = { kind: "ask" } | { kind: "working"; done: number } | { kind: "done"; message: string };

// The browser's folder picker, writable this time.
interface WritableDir {
  name: string;
  getFileHandle(name: string, opts: { create: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/** A folder to save into: the native dialog in the desktop app, the folder picker in a browser. */
async function chooseFolder(): Promise<{ label: string; save: (name: string, dataUrl: string) => Promise<void> } | null> {
  if (inDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "Save Legend imagery to…" });
    if (typeof dir !== "string") return null;
    return { label: dir, save: async (name, dataUrl) => void (await invoke("save_image", { dir, name, dataUrl })) };
  }
  const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: "readwrite" }) => Promise<WritableDir> }).showDirectoryPicker;
  if (!picker) throw new Error("This browser can't save to a folder. Use Chrome, Edge or the desktop app.");
  let dir: WritableDir;
  try {
    dir = await picker({ mode: "readwrite" });
  } catch {
    return null; // cancelled
  }
  return {
    label: dir.name,
    save: async (name, dataUrl) => {
      const file = await dir.getFileHandle(`${name}.jpg`, { create: true });
      const out = await file.createWritable();
      await out.write(await (await fetch(dataUrl)).blob());
      await out.close();
    },
  };
}

const Camera = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M4 8.5a2 2 0 0 1 2-2h2l1.4-2h5.2l1.4 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.4" />
  </svg>
);

export function Imagery({ engine }: { engine: () => LegendEngine | null }) {
  const [stage, setStage] = useState<Stage | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // A click elsewhere closes the question (not a render in progress).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setStage((s) => (s?.kind === "working" ? s : null));
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const generate = async () => {
    const e = engine();
    if (!e) return;
    try {
      const folder = await chooseFolder();
      if (!folder) return setStage(null);
      setStage({ kind: "working", done: 0 });
      const images = await e.captureImagery((done) => setStage({ kind: "working", done }));
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      for (const img of images) await folder.save(`legend-${stamp}-${img.name}`, img.dataUrl);
      setStage({ kind: "done", message: `Saved ${images.length} images to ${folder.label}.` });
    } catch (err) {
      setStage({ kind: "done", message: `Couldn't save: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <div className="imagery" ref={box}>
      <button className={`dock-btn${stage ? " on" : ""}`} title="Generate imagery" onClick={() => setStage((s) => (s ? (s.kind === "working" ? s : null) : { kind: "ask" }))}>
        <Camera />
      </button>
      {stage && (
        <div className="confirm imagery-pop">
          {stage.kind === "ask" && (
            <>
              <b>Generate imagery?</b>
              <span className="muted">
                {SHOTS.length} stills of your Legend from different angles, lenses and poses, {IMAGE_SIZE.width}×{IMAGE_SIZE.height} JPEG, saved to a folder you choose.
              </span>
              <div className="confirm-buttons">
                <button onClick={generate}>Yes</button>
                <button onClick={() => setStage(null)}>No</button>
              </div>
            </>
          )}
          {stage.kind === "working" && (
            <>
              <b>Developing…</b>
              <span className="muted">
                {stage.done} of {SHOTS.length}
              </span>
            </>
          )}
          {stage.kind === "done" && (
            <>
              <span className="muted">{stage.message}</span>
              <div className="confirm-buttons">
                <button onClick={() => setStage(null)}>Done</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
