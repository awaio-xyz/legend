# Project Legend

A desktop app that renders a person's conversations with AI as a human bust made of points.
Head, heart, gut and spirit. **Read [README.md](README.md) before changing anything.**

## Rules that must not break

1. **Style is yours, the shape is the data's.** Users can restyle (palette, glyphs, edge style,
   smear amount, body, idle). They can never move, hide or invent a fragment. No feature may
   offer that.
2. **The raw log is the source of truth.** `raw/*.jsonl` is append-only. Everything else
   (session markdown, placement) is derived and must be regenerable from it.
3. **The genome is locked at birth and never interprets the data.** It's stored in
   `genome.json`, not recomputed. Each gene is drawn from its own hash.
4. **Placement is deterministic.** The same fragments in the same order always draw the same body.
5. **Privacy.** Redact secrets before anything touches disk. Respect `.legendignore`. Local only.
   Text is hidden in the render by default.
6. **Recursion guard.** The capture hook exits immediately when `LEGEND_CAPTURE=off`, and sets it
   for any `claude -p` it spawns.

## Stack

Tauri + React + Vite + Three.js (decision 14).

## Working here

- Keep the README current as the code diverges. Docs that drift are worse than none.
