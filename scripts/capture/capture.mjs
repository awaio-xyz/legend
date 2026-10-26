// The capture hook (Claude Code, UserPromptSubmit). Step 1 of 2: append the prompt to the raw
// log, redacted, then start the classifier in the background and exit at once. Prints nothing:
// a UserPromptSubmit hook's output would be added to the conversation.
//   Off:     LEGEND_CAPTURE=off, or a .legendignore file in the project or any parent folder.
//   Vault:   LEGEND_VAULT, else ~/.legend/config.json's "vault", else ~/Legend.
//   Privacy: the vault's settings.json. Below verbatim, the prompt is scored here and only the
//            scores (and keywords) are written: the text never reaches the disk.
import { appendFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureVault, ignored, localIso, monthFile, readSettings } from "./vault.mjs";
import { redact } from "./redact.mjs";
import { scoredLine } from "./privacy.mjs";

function main() {
  if (process.env.LEGEND_CAPTURE === "off") return;
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const text = typeof input.prompt === "string" ? input.prompt : "";
  if (!text.trim() || text.trim().startsWith("<")) return; // empty, or a system-injected block
  if (ignored(input.cwd)) return;

  ensureVault();
  const t = localIso();
  const settings = readSettings();
  let line = { t, session: String(input.session_id ?? "unknown"), text: redact(text) };
  if (settings.recordProject && input.cwd) line.project = basename(input.cwd);
  if (settings.privacy !== "verbatim") line = scoredLine(line, settings.privacy);
  appendFileSync(monthFile(t), JSON.stringify(line) + "\n");

  // Classify in the background. The child runs with capture off, so nothing it does is captured.
  const here = dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, [join(here, "classify.mjs")], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, LEGEND_CAPTURE: "off", QUALIA_CAPTURE: "off", QUALIA_AUTHORSHIP_HOOK: "off" },
  });
  child.unref();
}

try {
  main();
} catch {
  /* capture must never get in the way of the conversation */
}
process.exit(0);
