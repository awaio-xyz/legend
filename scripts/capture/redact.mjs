// Secrets never touch disk: they're replaced before the raw log is written.
const PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI / Anthropic style keys
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
  /\b(?:bearer|token|api[_-]?key|secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{6,}/gi,
  /\b[A-Fa-f0-9]{40,}\b/g, // long hex strings
  /\b[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9+/])/g, // long base64 runs
];

export function redact(text) {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[redacted]");
  return out;
}
