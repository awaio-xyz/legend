// The Experiment panel (the Experiment button or E toggles it): a simulated person to explore,
// grown from sliders. It never touches the user's own Legend: loading a vault and coming back here
// just swaps which person is drawn. Also the anchor-point ghost.
import { RARE_TRAITS } from "../engine/genome";
import { simTotal, type SimParams } from "../engine/fragments";
import { etherFraction, etherRelease } from "../engine/placement";
import type { RarePreview } from "../App";
import { Select, Slider, Toggle } from "./controls";

interface Props {
  rarePreview: RarePreview;
  onRarePreview: (r: RarePreview) => void;
  sim: SimParams;
  onSim: (s: SimParams) => void;
  live: boolean;
  onLive: (on: boolean) => void;
  onReplay: () => void;
  source: string | null; // a loaded vault's name, or null for simulated data
  onSimulate: () => void;
  ghost: boolean;
  onGhost: (on: boolean) => void;
  onClose: () => void;
}

export function Panel(p: Props) {
  const total = simTotal(p.sim);
  return (
    <aside className="panel">
      <header>
        <h2>Experiment</h2>
        <button className="mini" title="Close" onClick={p.onClose}>
          ×
        </button>
      </header>
      <div className="muted panel-intro">A simulated person to explore. Your own Legend is never changed.</div>

      <section>
        <h2>The person · {p.source ? `showing ${p.source}` : "simulated"}</h2>
        {p.source && <button onClick={p.onSimulate}>Back to the simulated person</button>}
        <div className="muted">fragments they've said, by region</div>
        {(["head", "heart", "gut", "spirit"] as const).map((r, i) => (
          <Slider
            key={r}
            label={r}
            min={0}
            max={50000}
            step={100}
            value={p.sim.counts[i]}
            onChange={(v) => {
              const counts = [...p.sim.counts] as SimParams["counts"];
              counts[i] = v;
              p.onSim({ ...p.sim, counts });
            }}
          />
        ))}
        <div className="sim-total" title="Ether releases at 13k, 21k, 34k, 55k, 89k, 144k…">
          <b>{total.toLocaleString()}</b>
          <span>fragments</span>
          <span className="muted">
            release {etherRelease(total)} · {(etherFraction(total) * 100).toFixed(1)}% ether
          </span>
        </div>
        <Slider label="replay seconds" min={5} max={120} step={1} value={p.sim.replaySeconds} onChange={(v) => p.onSim({ ...p.sim, replaySeconds: v })} />
        <Select<RarePreview> label="rare trait" value={p.rarePreview} options={[["genome", "as drawn"], ["none", "none"], ...RARE_TRAITS.map((t) => [t, t] as [RarePreview, string])]} onChange={p.onRarePreview} />
        <Toggle label="ghost mannequin" value={p.ghost} onChange={p.onGhost} />
        <div className="buttons">
          <button onClick={p.onReplay}>Replay growth</button>
          <button onClick={() => p.onLive(!p.live)}>{p.live ? "Stop live" : "Go live"}</button>
        </div>
      </section>
    </aside>
  );
}
