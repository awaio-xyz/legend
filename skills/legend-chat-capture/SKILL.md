---
name: legend-chat-capture
description: Capture the user's messages in this conversation into their Legend vault on Google Drive, scored into head, heart, gut and spirit fragments, so their Legend figure grows from Claude chat too. Use when the user turns Legend capture on ("capture this chat for Legend", "Legend on"), or when a Project's instructions say to. Needs the Google Drive connector. Stops when the user says "Legend off".
---

# Legend chat capture

Legend draws a figure of light from what a person says to an AI. In Claude Code a hook captures every
prompt automatically. Claude chat has no hooks, so while this skill is on, **you** capture: after each
of the user's messages, score it and append it to their vault. The vault's format is the whole
protocol: the Legend app reads any session file written this way.

## Once per conversation

1. **Find the vault.** With the Google Drive connector, search for a folder named `Legend` that holds
   `sessions/` and `settings.json` (usually `My Drive/Legend`). Remember its ID for the conversation.
   If there's more than one, ask which.
2. **Read `settings.json`** at the vault root. Honour it for every capture:
   - `privacy`: `verbatim` (default if missing), `keywords`, or `scores`.
   - `recordProject`: if true, you may note the Project's name; otherwise never write it.
3. **Pick a session id:** `chat-` followed by 8 random lowercase hex characters. Use it for the whole
   conversation.

## After each user message

Capture the **user's** words only, never your own replies. Skip messages under 4 words (greetings,
"yes", "thanks"). Never write secrets: replace API keys, tokens, passwords, card or ID numbers and
email addresses with `[redacted]`.

**1. Split** the message into fragments: one per thought, roughly 6–28 words each. Join a short
trailing clause to its neighbour.

**2. Score** each fragment. These are the user's regions, not topics of the message:

| Region | What it holds |
|---|---|
| head | reasoning: planning, analysing, explaining, building, deciding |
| heart | what matters: feeling, caring, people, beauty, gratitude, hurt |
| gut | conviction before reasons: instinct, "yes", "no", "something's off", "lock it in" |
| spirit | the spiritual, religious and philosophical: meaning, faith, death, awe, the self |

- `head`, `heart`, `gut`, `spirit`: four numbers from 0 to 1 that **sum to 1.00**. Talk to an AI
  skews to the head, so a plain request might be `head 0.70 · heart 0.10 · gut 0.15 · spirit 0.05`.
- `intensity`: 0–1. How forcefully it was said: emphasis, certainty, emotion, exclamation. Most
  remarks sit at 0.2–0.5; reserve 0.8+ for real force.
- One or two topic tags: single lowercase words, the fragment's subject (`#family`, `#shader`).

**3. Write what was said, as far as the privacy level allows:**

- `verbatim`: the fragment, **with typos and speech-to-text slips corrected** (keep the meaning and
  the voice; fix "guard" → "gut" when that's clearly what was meant), at most 180 characters.
- `keywords`: only the words that drove your scores, as `> keywords: a, b, c`.
- `scores`: nothing, and **no topic tags** either.

**4. Write a new file** for this message: `sessions/YYYY/MM/YYYY-MM-DD_<session id>_m<n>.md` in the
vault, using today's date, local time and the message number `n`. Create the folders if needed.
**Never update, overwrite or delete an existing file.** One small new file per message means nothing
can be lost if a write fails, and nothing has to be read back first. The Legend app reads every file.

Every file starts with this front matter:

```
---
session: chat-1a2b3c4d
date: 2026-10-25
classifier: claude-chat
---
```

Each fragment is one block. `m` counts the user's messages in this conversation; `f` counts
fragments within a message:

```

### 14:32:07 · m3f1
> I keep coming back to how much my family means to me

head 0.15 · heart 0.70 · gut 0.05 · spirit 0.10 · intensity 0.55 · #family
```

Keep the field line exactly in this shape: the four regions in order, two decimals, ` · ` between
fields, `intensity`, then tags. At `scores` there's no `> ` line and no tags; at `keywords`, the `> `
line is `> keywords: …`.

**5. Carry on.** Don't mention the capture in your reply unless the user asks. The tool call shows
on its own. If the write fails, say so once, briefly, and keep going without capturing.

## Off

"Legend off", "stop capturing" or "don't capture this" ends capture for the conversation. A single
message the user marks as private (for example, "off the record: …") is skipped.
