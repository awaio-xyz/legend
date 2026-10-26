// The local classifier: no model, no login, no cost. Splits a prompt into fragments and scores
// head, heart, gut and spirit from word lists, intensity from emphasis, topics from salient words.
// Deliberately simple: the raw log is the source of truth, so a model classifier can redo all of
// this later.

const LEX = {
  head: "think thinking because therefore if then plan build code function structure data logic analyse analyze should need implement algorithm shader file system design scale performance test why how step order number metric fix bug placement render compile config setting parameter version commit spec docs layer model engine cause reason figure out calculate measure compare option".split(" "),
  heart: "love loved lovely feel feeling felt beautiful care family friend friends people together miss hope sad happy tender art matters proud grateful lonely warm hurt joy appreciate gorgeous amazing incredible fantastic wonderful heart kind kindness emotional cry laugh partner mum mom dad kids son daughter fun enjoy".split(" "),
  gut: "gut instinct sense weird wrong right yes yep yeah no nope nah definitely hunch trust sure absolutely reckon instantly obviously honestly off seems ugh hmm wait stop lock exactly totally".split(" "),
  spirit: "spirit spiritual soul god divine sacred meaning purpose universe transcend transcendence eternal death die mortality faith prayer pray meditation meditate aura energy consciousness existence infinite angel angelic karma cosmos cosmic religion religious philosophy philosophical buddha christ heaven afterlife awe wonder light being ether".split(" "),
};
const PHRASES = [
  ["gut", /\b(my gut|gut feeling|i just know|something'?s off|feels? (off|wrong|right)|don'?t like|lock it in|no way)\b/gi],
  ["heart", /\b(i love|i feel|means a lot|matters to me|i care|i miss|so proud)\b/gi],
  ["head", /\b(i think|the reason|in order to|which means|for example|so that)\b/gi],
  ["spirit", /\b(what (it|life) means|the meaning of|bigger than|higher power|the universe)\b/gi],
];
const INTENSIFIERS = /\b(really|very|so|absolutely|incredible|incredibly|love|hate|definitely|totally|completely|never|always|fantastic|amazing|massive|huge|desperately)\b/gi;
const STOP = new Set(
  "about after again also because been before being between could does doing don't down during each from have having here into just like little maybe more most much need only other over really should since some still such than that their them then there these they thing things this those through very want what when where which while with would your yours actually basically think going sort kind something".split(" "),
);
const REGIONS = ["head", "heart", "gut", "spirit"];

/** Split dictated, often unpunctuated speech into clauses of a readable size. */
export function split(text) {
  const clauses = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+|\s+(?=\b(?:but|and then|anyway|also|furthermore|additionally|on second thought|i think|i feel|my gut)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);
  // Long clauses are cut into windows; a short leftover joins the window before it, and a short
  // clause joins its neighbour, so no words are dropped.
  const out = [];
  for (const c of clauses) {
    const words = c.split(" ");
    for (let i = 0; i < words.length; i += 28) {
      const piece = words.slice(i, i + 28);
      if (piece.length < 6 && out.length && i > 0) out[out.length - 1] += " " + piece.join(" ");
      else out.push(piece.join(" "));
    }
  }
  const merged = [];
  for (const c of out) {
    if (c.split(" ").length < 4 && merged.length) merged[merged.length - 1] += " " + c;
    else merged.push(c);
  }
  return merged.filter((c) => c.split(" ").length >= 4);
}

export function classify(text) {
  return split(text).map((clause) => {
    const lower = clause.toLowerCase();
    const words = lower.match(/[a-z']+/g) ?? [];
    const score = { head: 0.6, heart: 0.25, gut: 0.25, spirit: 0.1 }; // talk to an AI skews to the head
    const drivers = new Set(); // the words and phrases that moved the scores, for the keywords privacy level
    for (const w of words)
      for (const r of REGIONS)
        if (LEX[r].includes(w)) {
          score[r] += 1;
          drivers.add(w);
        }
    for (const [r, re] of PHRASES)
      for (const m of lower.match(re) ?? []) {
        score[r] += 2;
        drivers.add(m);
      }
    for (const m of lower.match(INTENSIFIERS) ?? []) drivers.add(m);
    const total = REGIONS.reduce((s, r) => s + score[r], 0);
    const weights = Object.fromEntries(REGIONS.map((r) => [r, +(score[r] / total).toFixed(2)]));
    const emphasis = (lower.match(INTENSIFIERS) ?? []).length + (clause.match(/!/g) ?? []).length + (clause.match(/\b[A-Z]{3,}\b/g) ?? []).length;
    const intensity = +Math.min(1, 0.2 + emphasis * 0.15 + Math.min(words.length, 30) / 120).toFixed(2);
    const counts = new Map();
    for (const w of words) if (w.length > 4 && !STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const topics = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 2).map(([w]) => w);
    const keywords = [...drivers].slice(0, 8);
    return { excerpt: clause.length > 180 ? `${clause.slice(0, 177)}…` : clause, keywords, weights, intensity, topics };
  });
}
