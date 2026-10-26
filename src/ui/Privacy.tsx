// Privacy (desktop app only: a browser can't write to the vault). How much of what you say is kept,
// in the session files and the raw log alike, and whether captures note their project. Tightening
// rewrites what's already on disk, after a confirm; loosening only affects new captures.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toggle } from "./controls";

type Level = "verbatim" | "keywords" | "scores";
const LEVELS: { id: Level; label: string; note: string }[] = [
  { id: "verbatim", label: "Verbatim", note: "what you said, in full" },
  { id: "keywords", label: "Keywords", note: "only the words that drove the scores" },
  { id: "scores", label: "Scores only", note: "no words at all" },
];
const rank = (l: Level) => LEVELS.findIndex((x) => x.id === l);

interface Status {
  privacy: Level;
  record_project: boolean;
  records: number;
}

export function PrivacySection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ask, setAsk] = useState<{ privacy: Level; record_project: boolean } | null>(null);
  const [note, setNote] = useState("");

  const load = () => invoke<Status>("read_privacy").then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    load();
  }, []);

  if (!status) return <div className="muted">Privacy settings need the desktop app.</div>;

  const apply = async (next: { privacy: Level; record_project: boolean }) => {
    const started = await invoke<boolean>("write_privacy", { privacy: next.privacy, recordProject: next.record_project });
    const tighter = rank(next.privacy) > rank(status.privacy) || (status.record_project && !next.record_project);
    setNote(tighter ? (started ? "Rewriting existing records now." : "Existing records will be rewritten on the next capture.") : "Applies to new captures.");
    setAsk(null);
    load();
  };
  const change = (next: { privacy: Level; record_project: boolean }) => {
    const tighter = rank(next.privacy) > rank(status.privacy) || (status.record_project && !next.record_project);
    if (tighter && status.records > 0) setAsk(next);
    else apply(next);
  };

  return (
    <>
      <div className="muted privacy-intro">How much of what you say is kept. It covers the session files and the raw log, so a stricter level can't be undone.</div>
      {LEVELS.map((l) => (
        <label key={l.id} className="privacy-level">
          <input type="checkbox" checked={status.privacy === l.id} onChange={() => change({ privacy: l.id, record_project: status.record_project })} />
          <span>
            <b>{l.label}</b>
            <span className="muted">{l.note}</span>
          </span>
        </label>
      ))}
      <Toggle label="source project" value={status.record_project} onChange={(v) => change({ privacy: status.privacy, record_project: v })} />
      {ask && (
        <div className="confirm inline">
          <b>Rewrite {status.records.toLocaleString()} records?</b>
          <span className="muted">
            {rank(ask.privacy) > rank(status.privacy) ? `Everything already captured is cut down to "${LEVELS[rank(ask.privacy)].label.toLowerCase()}".` : "Project names are removed from everything already captured."} What's removed can't be brought back.
          </span>
          <div className="confirm-buttons">
            <button onClick={() => apply(ask)}>Yes, rewrite</button>
            <button onClick={() => setAsk(null)}>No</button>
          </div>
        </div>
      )}
      {note && <div className="muted">{note}</div>}
    </>
  );
}
