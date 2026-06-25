// Institution-name deduplication & collation layer.
//
// Implements the addendum "Institution-Name Deduplication & Collation (v0.1)"
// to the Aklan Referral Monitoring Dashboard spec. The same real institution is
// submitted by different providers under non-identical names (typos, abbreviations,
// punctuation, casing, token order) and sometimes with a missing/inconsistent NHFR
// id. Grouping on the raw name or raw id splits one institution into several. This
// module resolves every raw Organization record to a single canonical institution
// and exposes a resolver rho so the metric layer can collate counts before any
// panel is computed.
//
// Equation references (eq:xxx) point to the addendum:
//   eq:sim     normalized Levenshtein ratio
//   eq:match   match rule (NHFR hard-match OR sim >= tau)
//   eq:cankey  canonical key  = argmax_freq(non-null NHFR id) else hash(norm name)
//   eq:canname canonical name = argmax_freq(rawName), tie -> longest string

// Match threshold (addendum Step 3). NHFR-id match is authoritative and overrides
// the name test; the 80% name test is the fallback when ids differ or are missing.
export const DEDUP_THRESHOLD = 0.8;

// ----- raw input record ------------------------------------------------------

export interface RawInstitution {
  id: string; // FHIR Organization.id (used as the stable handle for this record)
  name: string; // Organization.name (REF-5 / REF-10)
  nhfrId: string | null; // Organization.identifier(NHFR).value (REF-6 / REF-11)
}

// ----- canonical institution -------------------------------------------------

export interface CanonicalInstitution {
  id: string; // canonical handle = id of the record that opened the group
  name: string; // nm(o_hat)  — eq:canname
  key: string; // key(o_hat) — eq:cankey (NHFR id or surrogate hash)
  keyIsSurrogate: boolean; // true when no member carried an NHFR id
  reprNorm: string; // representative normalised name used for comparisons
  memberIds: string[]; // Organization.ids absorbed into this canonical
  sourceNames: string[]; // distinct raw names absorbed (for the audit/facility key)
}

export interface DedupResult {
  canonicals: CanonicalInstitution[];
  // resolver rho, persisted as a map for reuse & audit: Organization.id -> canonical.id
  resolver: Map<string, string>;
  byId: Map<string, CanonicalInstitution>; // canonical.id -> canonical
  // merge log: only the groups that actually absorbed >1 raw record
  mergeLog: {
    name: string;
    key: string;
    keyIsSurrogate: boolean;
    sources: string[];
  }[];
}

// ----- Step 1: normalisation -------------------------------------------------

// Common suffix abbreviation expansions (addendum Step 1).
const SUFFIX_EXPANSIONS: [RegExp, string][] = [
  [/\bmem\b/g, "memorial"],
  [/\bhosp\b/g, "hospital"],
  [/\bdist\b/g, "district"],
  [/\bmun\b/g, "municipal"],
  [/\binf\b/g, "infirmary"],
  [/\bmed\b/g, "medical"],
  [/\bctr\b/g, "center"],
  [/\bgen\b/g, "general"],
  [/\bprov\b/g, "provincial"],
  [/\bst\b/g, "saint"],
  [/\brhu\b/g, "rural health unit"],
];

// Stop-tokens removed after expansion (addendum Step 1).
const STOPWORDS = new Set(["the", "of", "and"]);

export function normalize(name: string): string {
  let s = (name || "").toLowerCase();
  // strip punctuation -> spaces (so "st." and "st" collapse the same way)
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // expand common suffix abbreviations
  for (const [re, full] of SUFFIX_EXPANSIONS) s = s.replace(re, full);
  // drop stop-tokens
  s = s
    .split(" ")
    .filter((tok) => tok && !STOPWORDS.has(tok))
    .join(" ");
  return s.replace(/\s+/g, " ").trim();
}

// ----- Step 2: pairwise similarity (eq:sim) ----------------------------------

// Levenshtein edit distance.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Normalised Levenshtein ratio in [0,1]: 1 - lev / max(len).
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// ----- surrogate key hash ----------------------------------------------------

// Stable surrogate key for a group with no NHFR id (addendum eq:cankey fallback).
function surrogateKey(norm: string): string {
  let h = 5381;
  for (let i = 0; i < norm.length; i += 1) {
    h = (h * 33) ^ norm.charCodeAt(i);
  }
  // unsigned hex
  return "SUR-" + (h >>> 0).toString(16).toUpperCase();
}

// ----- Steps 3–6: grouping, canonical attributes, resolver -------------------

interface Group {
  id: string;
  reprNorm: string;
  memberIds: string[];
  rawNames: string[];
  nhfrIds: (string | null)[];
}

export function canonicalize(records: RawInstitution[]): DedupResult {
  // Order sensitivity caveat (addendum Caveats): a greedy single pass over pairwise
  // comparisons can depend on record order, so process the most complete records
  // (those carrying an NHFR id) first to anchor groups on authoritative ids.
  const ordered = [...records].sort((x, y) => {
    const xa = x.nhfrId ? 0 : 1;
    const ya = y.nhfrId ? 0 : 1;
    if (xa !== ya) return xa - ya;
    return (y.name?.length || 0) - (x.name?.length || 0);
  });

  const groups: Group[] = [];
  // index canonical groups by NHFR id for the authoritative hard match (eq:match)
  const groupByNhfr = new Map<string, Group>();

  for (const g of ordered) {
    const norm = normalize(g.name);

    // (1) NHFR hard match — authoritative, overrides the name test.
    if (g.nhfrId) {
      const hit = groupByNhfr.get(g.nhfrId);
      if (hit) {
        hit.memberIds.push(g.id);
        hit.rawNames.push(g.name);
        hit.nhfrIds.push(g.nhfrId);
        continue;
      }
    }

    // (2) Best name match >= tau among existing canonicals (eq:sim / eq:match).
    let best: Group | null = null;
    let bestSim = -1;
    for (const grp of groups) {
      const s = similarity(norm, grp.reprNorm);
      if (s > bestSim) {
        bestSim = s;
        best = grp;
      }
    }

    if (best && bestSim >= DEDUP_THRESHOLD) {
      best.memberIds.push(g.id);
      best.rawNames.push(g.name);
      best.nhfrIds.push(g.nhfrId);
      if (g.nhfrId && !groupByNhfr.has(g.nhfrId)) groupByNhfr.set(g.nhfrId, best);
      continue;
    }

    // (3) No canonical reached tau -> open a new one; its name is the representative.
    const grp: Group = {
      id: g.id,
      reprNorm: norm,
      memberIds: [g.id],
      rawNames: [g.name],
      nhfrIds: [g.nhfrId],
    };
    groups.push(grp);
    if (g.nhfrId) groupByNhfr.set(g.nhfrId, grp);
  }

  // Step 5 — canonical attributes.
  const canonicals: CanonicalInstitution[] = groups.map((grp) => {
    // key(o_hat): most frequent non-null NHFR id; else stable surrogate hash.
    const idFreq = new Map<string, number>();
    for (const v of grp.nhfrIds) {
      if (v) idFreq.set(v, (idFreq.get(v) || 0) + 1);
    }
    let key = "";
    let keyIsSurrogate = false;
    if (idFreq.size > 0) {
      key = [...idFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    } else {
      key = surrogateKey(grp.reprNorm);
      keyIsSurrogate = true;
    }

    // nm(o_hat): most frequent raw name, tie-break longest string.
    const nameFreq = new Map<string, number>();
    for (const n of grp.rawNames) nameFreq.set(n, (nameFreq.get(n) || 0) + 1);
    const name = [...nameFreq.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })[0][0];

    const sourceNames = [...new Set(grp.rawNames)];

    return {
      id: grp.id,
      name,
      key,
      keyIsSurrogate,
      reprNorm: grp.reprNorm,
      memberIds: grp.memberIds,
      sourceNames,
    };
  });

  // Step 6 — resolver rho, persisted as Organization.id -> canonical.id.
  const resolver = new Map<string, string>();
  const byId = new Map<string, CanonicalInstitution>();
  for (const c of canonicals) {
    byId.set(c.id, c);
    for (const m of c.memberIds) resolver.set(m, c.id);
  }

  const mergeLog = canonicals
    .filter((c) => c.sourceNames.length > 1 || c.memberIds.length > 1)
    .map((c) => ({
      name: c.name,
      key: c.key,
      keyIsSurrogate: c.keyIsSurrogate,
      sources: c.sourceNames,
    }))
    .sort((a, b) => b.sources.length - a.sources.length);

  return { canonicals, resolver, byId, mergeLog };
}
