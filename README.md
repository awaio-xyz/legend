# Legend

A figure of light, made of what you say to AI.

Every message you send to Claude is split into fragments and scored for where it comes from: the
**head** (reasoning), the **heart** (what matters), the **gut** (conviction before reasons) or the
**spirit** (meaning, awe, the philosophical). Each fragment becomes a point in a human figure. Over
time the figure fills in, breathes, walks, and shows where your attention actually lives.

**Style is yours, the shape is the data's.** You can restyle everything about how it looks. You can
never move, hide or invent a fragment.

## Run

```bash
npm install
npm run dev          # in a browser, http://localhost:1420
npm run tauri dev    # the desktop app, with the floating widget
```

The desktop app needs [Rust](https://rustup.rs) and the Tauri prerequisites for your platform.

### The interface

- **Bottom left:** settings (Figure, Colour, Light, Effects, Privacy, presets), randomise, stats
  (what your Legend is made of), timeline (your Legend over time, with time travel) and the folder
  (your Legend, recent vaults, or open any folder).
- **Bottom right:** generate imagery (ten stills for sharing) and Experiment (a simulated person to
  explore, which never touches your own Legend).
- **Top:** hide the interface (or **H**), undo and redo (**Ctrl+Z** / **Ctrl+Y**).
- **The widget** (desktop app): a small frameless window that floats above every other window and
  shows only the figure, live. **W** shows or hides it.

## Capture

Capture is a [Claude Code](https://claude.com/claude-code) hook. Add it to `~/.claude/settings.json`:

```json
"hooks": {
  "UserPromptSubmit": [
    { "hooks": [{ "type": "command", "command": "node \"<path to legend>/scripts/capture/capture.mjs\"" }] }
  ]
}
```

From then on, every prompt you send in Claude Code, in any project, is redacted, logged and scored
into your vault. The hook prints nothing and never blocks a conversation.

- **Opt out** of a project with a `.legendignore` file in it, or of everything with `LEGEND_CAPTURE=off`.
- **Scoring** is a local word-list classifier: no model, no login, no cost. The raw log is the source
  of truth, so `node scripts/capture/classify.mjs --rebuild` can redo everything with a better one.
- **Claude chat** has no hooks. Upload `skills/legend-chat-capture` as a skill in claude.ai and say
  "Legend on" in a chat; Claude then writes its own fragments to your vault through the Google Drive
  connector (the vault has to live on a synced Drive folder for this).

### Where the vault lives

`LEGEND_VAULT` if set, else `"vault"` in `~/.legend/config.json`, else `~/Legend`. Capture and the
desktop app look in the same places. A vault is a plain folder:

```
Legend/
  raw/YYYY-MM.jsonl            every prompt, one line each (append-only, the source of truth)
  sessions/YYYY/MM/*.md        fragments, one block each: when, what was said, and its scores
  settings.json                privacy
  genome.json                  the figure's seed, locked at birth (optional)
```

A fragment block looks like this:

```
### 14:32:07 · m3f1
> I keep coming back to how much my family means to me

head 0.15 · heart 0.70 · gut 0.05 · spirit 0.10 · intensity 0.55 · #family
```

### Privacy

Set in the desktop app (Settings → Privacy). It governs the raw log as well as the session files.

| Level | Kept |
|---|---|
| Verbatim (default) | what you said, redacted of keys and secrets |
| Keywords | only the words that drove the scores |
| Scores only | no words at all; topics become salted hashes |

Below verbatim the hook scores each prompt itself and writes no text, so a stricter level can't be
undone or rescored. Tightening rewrites what's already captured, after a confirm. Recording which
project a prompt came from is a separate toggle, off by default. Everything stays local.

## How the figure grows

- **Placement** is deterministic: the same fragments in the same order always draw the same body.
  Intense thoughts condense into the organs (brain, heart, gut); passing remarks form the skin and
  slowly grow the arms and legs. A full region deepens rather than spilling over: its nodes take more
  points and glow brighter, and full limbs deepen the same way so they keep pace with the core.
- **Spirit** fills a seven-layer aura around the body.
- **The ether** is time. A growing share of what you say, released in golden-ratio steps at
  Fibonacci counts, drifts into the space around the figure and loosens it, until after years of
  use the person becomes light.
- **Behaviour follows the data.** Which moves the figure makes (and whether it stands, walks or
  levitates) is weighted by your recent mix of head, heart, gut and spirit. It turns toward new
  fragments as they land, and often answers them in place: a reach toward ones out in the aura, a
  hand to where they touched the body.
- **The genome** (20 genes and rare traits) is seeded from your first words and locked at birth. It
  sets temperament, not data.

## Code

| Path | What |
|---|---|
| `src/engine/legend.ts` | The engine: layers, render loop, time travel, imagery |
| `src/engine/placement.ts` | Where each fragment lands: routes, limbs, ether, deepening |
| `src/engine/mannequin.ts` | The body (an SDF), its anchors, organs and aura |
| `src/engine/shaders.ts` | Points, lines, motion, breathing, heartbeat and the aura, in GLSL |
| `src/engine/idle.ts`, `walk.ts` | The library of moves and the walking journey |
| `src/engine/genome.ts` | The genes and rare traits |
| `src/ui/` | The dock, panels, timeline, widget and privacy controls |
| `scripts/capture/` | The hook, classifier, redaction and privacy scrubbing |
| `src-tauri/` | The desktop shell: vault reading, the widget window, privacy writes |
| `skills/legend-chat-capture/` | The skill that lets Claude chat capture too |

## License

[MIT](LICENSE)
