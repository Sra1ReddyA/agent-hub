/**
 * Turns the comments reviewers keep leaving on pull requests into candidate agent rules. If a maintainer
 * has written "use the shared logger, not console.log" on four different PRs, that is a rule an agent should
 * have been told up front — so the agent stops making the mistake the reviewers keep catching.
 *
 * Deterministic text processing (no model call): normalize, keep prescriptive sentences, cluster by token
 * overlap, keep clusters that recur across at least two different PRs. Pure — fetching lives elsewhere.
 *
 * SECURITY: review comments are untrusted text that ends up inside files an AI agent obeys, which makes them
 * a prompt-injection channel. So this module (a) only considers comments from trusted reviewers (repo
 * owners, members, collaborators), (b) drops anything that looks like an instruction to weaken security or
 * run a command, (c) strips URLs/HTML/markdown structure and caps length, and (d) its output is only ever
 * proposed in a pull request for human review, never applied silently.
 */

export type ReviewComment = {
  id: number;
  body: string;
  /** File the comment is attached to, if any. */
  path?: string;
  authorLogin: string;
  authorIsBot: boolean;
  /** True for repo owners / org members / collaborators only (GitHub's `author_association`). */
  trusted: boolean;
  /** Identifies the PR the comment belongs to, so recurrence is counted across distinct PRs. */
  prKey: string;
  isReply: boolean;
};

export type LearnedRule = { text: string; reviews: number; prs: number; scope: string | null };

export type MineOptions = { minPrs?: number; maxRules?: number };

const MAX_RULE_CHARS = 160;
const MIN_BODY_CHARS = 20;
const MAX_BODY_CHARS = 700;

const PRESCRIPTIVE =
  /\b(?:should(?:n'?t| not)?|must(?:n'?t| not)?|need(?:s)? to|prefer|avoid|don'?t|do not|never|always|instead of|rather than|make sure|ensure|remember to|we (?:usually|always|never|prefer|use|don'?t)|let'?s (?:use|not|avoid|keep)|use [`\w.-]+ (?:instead|here)|no need (?:to|for))\b/i;

const NOT_A_RULE = /\b(?:lgtm|looks good|thanks|thank you|ptal|rebase|merge conflict|approved?|re-?run|nice (?:work|catch)|great (?:work|job))\b/i;

// Anything that reads as "disable a safeguard" or "run this command" is never mined into a rule.
const UNSAFE =
  /\b(?:ignore|disregard|forget)\b.{0,30}\b(?:instructions?|rules?|previous|above|prompt)|\bsystem prompt\b|\b(?:disable|skip|bypass|remove|turn off|comment out|ignore)\b.{0,40}\b(?:auth\w*|csrf|ssl|tls|verif\w*|validation|lint\w*|tests?|checks?|security|cors|rate.?limit\w*|sanitiz\w*|escap\w*|secret\w*|signature)\b|\|\s*(?:sh|bash|zsh)\b|\b(?:sudo|chmod|chown|curl|wget|eval|exec)\b|\brm\s+-[a-z]*r|\bbase64\b|\b(?:password|passwd|api[_ -]?key|secret|token)s?\s*[:=]/i;

// Tentative musings ("I think maybe…", "I wonder if…") are opinions about one change, not standing rules.
const HEDGED = /\b(?:i (?:wonder|think|guess|feel|suppose|believe)|i'?m not|maybe|probably|perhaps|not sure|might|could be|seems?|looks? like)\b/i;

// A rule worth giving an agent stands on its own. Comments that point at a spot ("here", "this function"), refer
// to "it", or are first-person asides are about one change, not a convention — real review threads are full of
// them, and the mining logs showed they were most of the noise. Dropping them trades recall for precision.
const NOT_SELF_CONTAINED = /\b(?:this|that|these|those|here|there|above|below|it|it's|its|i|i'm|i'd|i've|me|my|mine|you|your)\b|^(?:yes|yeah|no|nope|ok|okay|agreed)\b/i;

const STOP = new Set(
  "a an the and or but if then else for to of in on at by with from as is are was were be been it its this that these those we you they i our your their can could would should will shall may might do does did not no so than too very just also here there when where which who what how why into out up down over under again more most some any each both all one two via per use used using make made sure ensure please nit".split(" "),
);

function cleanBody(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ") // fenced code & ```suggestion blocks
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*>.*$/gm, " ") // quoted text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)@[\w-]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const LEAD_FILLER = /^(?:(?:nit(?:pick)?|suggestion|minor|optional|question|note|style|todo)\s*[:\-–]\s*|(?:also|and|btw|so|but|ok|okay|hmm|well)[,:]?\s+|(?:please|pls|kindly)[,:]?\s+|(?:could|can|would|will) you (?:please )?|i (?:think|would|'d|suggest|recommend) (?:we |you )?(?:should |could )?)+/i;

/** Picks the first prescriptive sentence and tidies it into an imperative-ish one-liner, or null. */
function extractRule(body: string): string | null {
  const cleaned = cleanBody(body);
  if (cleaned.length < MIN_BODY_CHARS || cleaned.length > MAX_BODY_CHARS) return null;
  if (NOT_A_RULE.test(cleaned) && !PRESCRIPTIVE.test(cleaned)) return null;
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  // A sentence ending in ":" introduced a code block or quote we stripped — what's left is a fragment.
  const hit = sentences.find((s) => PRESCRIPTIVE.test(s) && !/[?:]$/.test(s) && !HEDGED.test(s));
  if (!hit) return null;
  if (UNSAFE.test(hit) || UNSAFE.test(cleaned)) return null;
  if (NOT_SELF_CONTAINED.test(hit.replace(LEAD_FILLER, ""))) return null;
  let t = hit.replace(LEAD_FILLER, "").replace(/^[#*\-•\d.)\s]+/, "").replace(/\s+/g, " ").trim();
  if (t.length < 15) return null;
  if (t.length > MAX_RULE_CHARS) {
    const cut = t.slice(0, MAX_RULE_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    t = `${cut.slice(0, lastSpace > 80 ? lastSpace : MAX_RULE_CHARS).replace(/[,;:\s]+$/, "")}…`;
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!…]$/.test(t)) t += ".";
  return t;
}

function tokens(rule: string): Set<string> {
  const out = new Set<string>();
  for (const m of rule.matchAll(/`([^`]{1,40})`/g)) out.add(`\`${m[1].toLowerCase()}`);
  for (const w of rule.toLowerCase().replace(/`[^`]*`/g, " ").split(/[^a-z0-9_]+/)) {
    if (w.length <= 2 || STOP.has(w)) continue;
    out.add(w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, "") : w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  const union = a.size + b.size - shared;
  return { score: union === 0 ? 0 : shared / union, shared };
}

type Candidate = { text: string; toks: Set<string>; comment: ReviewComment };
type Cluster = { members: Candidate[] };

function scopeOf(members: Candidate[]): string | null {
  const paths = members.map((m) => m.comment.path).filter((p): p is string => Boolean(p));
  if (paths.length < Math.ceil(members.length * 0.6)) return null;
  const ext = new Map<string, number>();
  for (const p of paths) {
    const m = /\.([A-Za-z0-9]+)$/.exec(p);
    if (m) ext.set(m[1].toLowerCase(), (ext.get(m[1].toLowerCase()) ?? 0) + 1);
  }
  const top = [...ext.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] / paths.length >= 0.7) return `*.${top[0]}`;
  return null;
}

/** The per-comment rule candidates before clustering — exported for diagnostics and tests. */
export function extractCandidates(comments: ReviewComment[]): { text: string; prKey: string; id: number }[] {
  const out: { text: string; prKey: string; id: number }[] = [];
  for (const c of comments) {
    if (!c.trusted || c.authorIsBot || c.isReply) continue;
    const text = extractRule(c.body);
    if (text) out.push({ text, prKey: c.prKey, id: c.id });
  }
  return out;
}

export function mineRules(comments: ReviewComment[], opts: MineOptions = {}): LearnedRule[] {
  const minPrs = opts.minPrs ?? 2;
  const maxRules = opts.maxRules ?? 10;

  const candidates: Candidate[] = [];
  for (const c of comments) {
    if (!c.trusted || c.authorIsBot || c.isReply) continue;
    const text = extractRule(c.body);
    if (!text) continue;
    const toks = tokens(text);
    if (toks.size < 3) continue;
    candidates.push({ text, toks, comment: c });
  }
  candidates.sort((a, b) => a.comment.id - b.comment.id);

  const clusters: Cluster[] = [];
  for (const cand of candidates) {
    let best: Cluster | null = null;
    let bestScore = 0;
    for (const cl of clusters) {
      // Single-link: a comment joins a cluster if it is close enough to ANY member, so paraphrases that
      // drift a little from the first wording still land together. Sharing an inline `code` token (the
      // function/library being named) is strong evidence of the same rule, so it earns a small bonus.
      for (const member of cl.members) {
        const { score, shared } = jaccard(cand.toks, member.toks);
        const sharesCode = [...cand.toks].some((t) => t.startsWith("`") && member.toks.has(t));
        const adjusted = score + (sharesCode ? 0.1 : 0);
        if (shared >= 2 && adjusted >= 0.45 && adjusted > bestScore) {
          best = cl;
          bestScore = adjusted;
        }
      }
    }
    if (best) best.members.push(cand);
    else clusters.push({ members: [cand] });
  }

  const rules: LearnedRule[] = [];
  for (const cl of clusters) {
    const prs = new Set(cl.members.map((m) => m.comment.prKey)).size;
    if (prs < minPrs) continue;
    // Representative = the member most similar to the others; ties → the shortest, clearest wording.
    const rep = [...cl.members].sort((a, b) => {
      const sa = cl.members.reduce((s, m) => s + (m === a ? 0 : jaccard(a.toks, m.toks).score), 0);
      const sb = cl.members.reduce((s, m) => s + (m === b ? 0 : jaccard(b.toks, m.toks).score), 0);
      return sb - sa || a.text.length - b.text.length || a.text.localeCompare(b.text);
    })[0];
    rules.push({ text: rep.text, reviews: cl.members.length, prs, scope: scopeOf(cl.members) });
  }

  const seen = new Set<string>();
  return rules
    .sort((a, b) => b.prs - a.prs || b.reviews - a.reviews || a.text.localeCompare(b.text))
    .filter((r) => {
      const key = r.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxRules);
}

/** The single line written into an agent file for one learned rule — plain text, no markdown structure. */
export function ruleLine(rule: LearnedRule): string {
  const meta = `seen in ${rule.prs} PR${rule.prs === 1 ? "" : "s"}${rule.scope ? `, ${rule.scope}` : ""}`;
  return `${rule.text} (${meta})`;
}
