// Aggregation layer. Implements the operational definitions and equations from
// "Aklan Referral Monitoring Dashboard — Data Documentation" (the .tex spec).
//
// Equation references (eq:xxx) below point to that document:
//   eq:coord  Coordinated referrals          = sum over a,b,m of Coord(a,b,m)
//   eq:succ   Successful referral rate        = sum Succ / sum Coord * 100
//   eq:decl   Declined referral rate          = sum Unsucc / sum Coord * 100
//   eq:sub    Report submission rate (avg)    = mean over months of (#hospitals Encoded=Yes / |H|)
//   eq:quarter Coordinated referrals by quarter
//   eq:edge   Referral directionality         Edge(a->b) = sum_m Coord(a,b,m)
//   eq:out    Outgoing referrals              Out(o)  = sum_{b,m} Coord(o,b,m)
//   eq:in     Incoming referrals              In(o)   = sum_{a,m} Coord(a,o,m)
//   eq:topref Top referring facilities        = Out(a) ranked
//   eq:cases  Leading causes (top 5)          Cases(x)= sum_{a,m} N(a,m,x)
//   eq:count  Top reasons declined/unsuccessful
//   eq:cell   Submission status matrix cell   Encoded(o,m)

import {
  fetchAll,
  Organization,
  PractitionerRole,
  ServiceRequest,
  Task,
  Provenance,
  CodeableConcept,
} from "./fhir";

// ----- configurable mappings -------------------------------------------------

// Task.status -> referral outcome. The v0.1 mapping speaks of "Received" (success)
// and "Referred/Forwarded" (declined); live Connectathon data uses standard R4
// Task status codes, so both vocabularies are accepted here.
const SUCCESS_STATUS = new Set([
  "received",
  "accepted",
  "in-progress",
  "completed",
]);
const DECLINED_STATUS = new Set([
  "rejected",
  "referred",
  "forwarded",
  "cancelled",
  "failed",
  "entered-in-error",
]);

// Identifier systems that carry the National Health Facility Registry key.
const NHFR_RE = /nhfr|healthcare-facility-code/i;
// Heuristic: which organizations count as "hospitals" (vs primary care facilities).
const HOSPITAL_RE = /hospital|medical center|medical centre|infirmary|provincial|wvmc/i;

const Q_OF_MONTH: Record<string, "Q1" | "Q2" | "Q3" | "Q4"> = {
  "01": "Q1", "02": "Q1", "03": "Q1",
  "04": "Q2", "05": "Q2", "06": "Q2",
  "07": "Q3", "08": "Q3", "09": "Q3",
  "10": "Q4", "11": "Q4", "12": "Q4",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ----- output shape ----------------------------------------------------------

export interface NameValue {
  name: string;
  value: number;
}
export interface EdgeRow {
  label: string; // name(a) -> name(b)
  from: string;
  to: string;
  value: number;
}
export interface OutInRow {
  name: string;
  key: string;
  success: number;
  declined: number;
  pending: number;
  total: number;
}
export interface TopRefRow {
  name: string;
  value: number;
  isHospital: boolean;
}
export interface MatrixRow {
  name: string;
  fullName: string;
  cells: ("Yes" | "Not complete" | "No")[]; // 12 entries, Jan..Dec
}

export interface DashboardData {
  generatedAt: string;
  fhirBase: string;
  reportingYear: number;
  totals: {
    coordinated: number; // eq:coord
    successful: number;
    declined: number;
    pending: number;
    successRate: number; // eq:succ (%)
    declinedRate: number; // eq:decl (%)
    submissionRate: number; // eq:sub (%)
  };
  quarters: { name: string; value: number; partial: boolean }[]; // eq:quarter
  causes: NameValue[]; // eq:cases (top 5)
  edges: EdgeRow[]; // eq:edge
  outgoing: OutInRow[]; // eq:out
  incoming: OutInRow[]; // eq:in
  topReferring: TopRefRow[]; // eq:topref
  declined: NameValue[]; // eq:count
  declinedReasonAvailable: boolean;
  matrix: { months: string[]; rows: MatrixRow[] }; // eq:cell
  diagnostics: {
    serviceRequests: number;
    tasks: number;
    organizations: number;
    unresolvedSenders: number;
    unresolvedReceivers: number;
    missingMonth: number;
    taskStatusCounts: Record<string, number>;
  };
}

// ----- helpers ---------------------------------------------------------------

function refId(ref?: { reference?: string }): { type: string; id: string } | null {
  const r = ref?.reference;
  if (!r) return null;
  const [type, id] = String(r).split("/");
  if (!type || !id) return null;
  return { type, id };
}

function conceptLabel(c?: CodeableConcept): string | null {
  if (!c) return null;
  return c.text || c.coding?.find((x) => x.display)?.display || c.coding?.[0]?.code || null;
}

// ----- main ------------------------------------------------------------------

export async function getDashboardData(): Promise<DashboardData> {
  const [orgs, roles, srs, tasks, provs] = await Promise.all([
    fetchAll<Organization>("Organization"),
    fetchAll<PractitionerRole>("PractitionerRole"),
    fetchAll<ServiceRequest>("ServiceRequest"),
    fetchAll<Task>("Task"),
    fetchAll<Provenance>("Provenance"),
  ]);

  const orgById = new Map<string, Organization>();
  orgs.forEach((o) => orgById.set(o.id, o));
  const roleById = new Map<string, PractitionerRole>();
  roles.forEach((p) => roleById.set(p.id, p));
  const practitionerToOrg = new Map<string, string>();
  roles.forEach((p) => {
    const pr = refId(p.practitioner);
    const og = refId(p.organization);
    if (pr && og) practitionerToOrg.set(pr.id, og.id);
  });

  // Resolve any reference (Organization | PractitionerRole | Practitioner) to an Organization id.
  function resolveOrgId(ref?: { reference?: string }): string | null {
    const r = refId(ref);
    if (!r) return null;
    if (r.type === "Organization") return r.id;
    if (r.type === "PractitionerRole") {
      const og = refId(roleById.get(r.id)?.organization);
      return og ? og.id : null;
    }
    if (r.type === "Practitioner") {
      return practitionerToOrg.get(r.id) || null;
    }
    return null;
  }

  function orgName(id: string | null): string {
    if (!id) return "Unknown";
    return orgById.get(id)?.name?.trim() || `Org ${id}`;
  }
  // key(o) = Organization.identifier(NHFR).value, fallback to any identifier, then id.
  function orgKey(id: string | null): string {
    if (!id) return "—";
    const o = orgById.get(id);
    if (!o) return id;
    const ids = o.identifier || [];
    const nhfr = ids.find((x) => NHFR_RE.test(x.system || ""));
    return nhfr?.value || ids[0]?.value || o.id;
  }
  function isHospital(id: string | null): boolean {
    if (!id) return false;
    const o = orgById.get(id);
    const typeText = (o?.type || [])
      .map((t) => conceptLabel(t) || "")
      .join(" ");
    return HOSPITAL_RE.test(o?.name || "") || /hospital/i.test(typeText);
  }

  // Link each ServiceRequest to its Task via Task.focus.
  const taskBySr = new Map<string, Task>();
  tasks.forEach((t) => {
    const f = refId(t.focus);
    if (f && f.type === "ServiceRequest") taskBySr.set(f.id, t);
  });

  // ----- normalise each referral to a tuple (spec §"How to build", step 1) ---
  interface Tuple {
    a: string | null;
    b: string | null;
    month: string | null; // YYYY-MM
    outcome: "success" | "declined" | "pending";
    cause: string;
  }
  const tuples: Tuple[] = [];
  const taskStatusCounts: Record<string, number> = {};
  let unresolvedSenders = 0;
  let unresolvedReceivers = 0;
  let missingMonth = 0;
  const yearVotes: Record<string, number> = {};

  srs.forEach((s) => {
    const a = resolveOrgId(s.requester);
    let b = resolveOrgId(s.performer?.[0]);
    const task = taskBySr.get(s.id);
    if (!b && task) b = resolveOrgId(task.owner);

    const month = s.authoredOn ? String(s.authoredOn).slice(0, 7) : null;
    if (!a) unresolvedSenders += 1;
    if (!b) unresolvedReceivers += 1;
    if (!month) missingMonth += 1;
    if (month) {
      const y = month.slice(0, 4);
      yearVotes[y] = (yearVotes[y] || 0) + 1;
    }

    const status = (task?.status || "").toLowerCase();
    if (status) taskStatusCounts[status] = (taskStatusCounts[status] || 0) + 1;
    let outcome: Tuple["outcome"] = "pending";
    if (SUCCESS_STATUS.has(status)) outcome = "success";
    else if (DECLINED_STATUS.has(status)) outcome = "declined";

    const cause =
      conceptLabel(s.reasonCode?.[0]) ||
      conceptLabel(s.category?.[0]) ||
      conceptLabel(s.code) ||
      "Unspecified";

    tuples.push({ a, b, month, outcome, cause });
  });

  // ----- KPI totals (eq:coord, eq:succ, eq:decl) -----------------------------
  const coordinated = tuples.length;
  const successful = tuples.filter((t) => t.outcome === "success").length;
  const declinedCount = tuples.filter((t) => t.outcome === "declined").length;
  const pending = tuples.filter((t) => t.outcome === "pending").length;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  // ----- reporting year ------------------------------------------------------
  const reportingYear = process.env.REPORTING_YEAR
    ? Number(process.env.REPORTING_YEAR)
    : Number(
        Object.entries(yearVotes).sort((x, y) => y[1] - x[1])[0]?.[0] ||
          new Date().getFullYear(),
      );

  // ----- quarters (eq:quarter) ----------------------------------------------
  const qCounts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const qMonthsSeen: Record<string, Set<string>> = {
    Q1: new Set(), Q2: new Set(), Q3: new Set(), Q4: new Set(),
  };
  tuples.forEach((t) => {
    if (!t.month) return;
    if (t.month.slice(0, 4) !== String(reportingYear)) return;
    const q = Q_OF_MONTH[t.month.slice(5, 7)];
    if (q) {
      qCounts[q] += 1;
      qMonthsSeen[q].add(t.month.slice(5, 7));
    }
  });
  // Mark a quarter partial (Q*) if the data does not yet cover all 3 of its months
  // and it is the latest quarter that has any data.
  const quartersWithData = (["Q1", "Q2", "Q3", "Q4"] as const).filter(
    (q) => qCounts[q] > 0,
  );
  const latestQ = quartersWithData[quartersWithData.length - 1];
  const quarters = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({
    name: q,
    value: qCounts[q],
    partial: q === latestQ && qMonthsSeen[q].size < 3,
  }));

  // ----- directionality / outgoing / incoming (eq:edge, eq:out, eq:in) -------
  const edgeMap = new Map<string, number>();
  const outMap = new Map<string, OutInRow>();
  const inMap = new Map<string, OutInRow>();

  function ensure(map: Map<string, OutInRow>, id: string): OutInRow {
    let row = map.get(id);
    if (!row) {
      row = { name: orgName(id), key: orgKey(id), success: 0, declined: 0, pending: 0, total: 0 };
      map.set(id, row);
    }
    return row;
  }

  tuples.forEach((t) => {
    if (t.a && t.b) {
      const k = `${t.a}${t.b}`;
      edgeMap.set(k, (edgeMap.get(k) || 0) + 1);
    }
    if (t.a) {
      const row = ensure(outMap, t.a);
      row.total += 1;
      row[t.outcome] += 1;
    }
    if (t.b) {
      const row = ensure(inMap, t.b);
      row.total += 1;
      row[t.outcome] += 1;
    }
  });

  const edges: EdgeRow[] = Array.from(edgeMap.entries())
    .map(([k, value]) => {
      const [from, to] = k.split("");
      return { from, to, value, label: `${orgName(from)} → ${orgName(to)}` };
    })
    .sort((x, y) => y.value - x.value);

  const outgoing = Array.from(outMap.values()).sort((x, y) => y.total - x.total);
  const incoming = Array.from(inMap.values()).sort((x, y) => y.total - x.total);

  // ----- top referring facilities (eq:topref) --------------------------------
  const topReferring: TopRefRow[] = Array.from(outMap.entries())
    .map(([id, row]) => ({ name: row.name, value: row.total, isHospital: isHospital(id) }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 10);

  // ----- leading causes (eq:cases, top 5) ------------------------------------
  const causeMap = new Map<string, number>();
  tuples.forEach((t) => causeMap.set(t.cause, (causeMap.get(t.cause) || 0) + 1));
  const causes: NameValue[] = Array.from(causeMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 5);

  // ----- declined reasons (eq:count) -----------------------------------------
  // Task.statusReason is outside v0.1; if absent, show a single "Declined (total)" bar.
  const declinedReasonMap = new Map<string, number>();
  let declinedReasonAvailable = false;
  srs.forEach((s) => {
    const task = taskBySr.get(s.id);
    const status = (task?.status || "").toLowerCase();
    if (!DECLINED_STATUS.has(status)) return;
    const reason = conceptLabel(task?.statusReason);
    if (reason) {
      declinedReasonAvailable = true;
      declinedReasonMap.set(reason, (declinedReasonMap.get(reason) || 0) + 1);
    }
  });
  const declined: NameValue[] = declinedReasonAvailable
    ? Array.from(declinedReasonMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((x, y) => y.value - x.value)
    : [{ name: "Declined (total)", value: declinedCount }];

  // ----- submission status matrix (eq:cell) ----------------------------------
  // PROXY (no FHIR element for Encoded, per spec §FHIR): a facility is counted as
  // having "reported" for a month if it originated referral activity that month
  // (ServiceRequest.requester) or signed a Provenance recorded that month.
  const activity = new Map<string, Set<string>>(); // orgId -> set of "YYYY-MM"
  function mark(orgId: string | null, month: string | null) {
    if (!orgId || !month) return;
    if (!activity.has(orgId)) activity.set(orgId, new Set());
    activity.get(orgId)!.add(month);
  }
  srs.forEach((s) => mark(resolveOrgId(s.requester), s.authoredOn ? String(s.authoredOn).slice(0, 7) : null));
  provs.forEach((p) => {
    const month = p.recorded ? String(p.recorded).slice(0, 7) : null;
    (p.agent || []).forEach((ag) => mark(resolveOrgId(ag.who), month));
  });

  // Hospital rows: hospital-classified orgs that took part in referrals.
  const participating = new Set<string>();
  tuples.forEach((t) => {
    if (t.a) participating.add(t.a);
    if (t.b) participating.add(t.b);
  });
  const hospitalIds = Array.from(participating)
    .filter((id) => isHospital(id))
    .sort((x, y) => orgName(x).localeCompare(orgName(y)));
  // Fall back to top facilities if heuristic finds no hospitals.
  const matrixIds = hospitalIds.length
    ? hospitalIds
    : topReferring.slice(0, 8).map((r) => {
        const found = Array.from(outMap.entries()).find(([, v]) => v.name === r.name);
        return found ? found[0] : "";
      }).filter(Boolean);

  const matrixRows: MatrixRow[] = matrixIds.map((id) => {
    const months = activity.get(id) || new Set<string>();
    const cells = MONTH_LABELS.map((_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const yes = months.has(`${reportingYear}-${mm}`);
      return (yes ? "Yes" : "No") as "Yes" | "No";
    });
    const full = orgName(id);
    return {
      name: abbreviate(full),
      fullName: full,
      cells,
    };
  });

  // ----- submission rate KPI (eq:sub) ----------------------------------------
  // Mean over months (that have any activity) of the share of hospital rows Encoded=Yes.
  const H = matrixRows.length;
  let monthsCounted = 0;
  let rateSum = 0;
  for (let i = 0; i < 12; i += 1) {
    const yesCount = matrixRows.filter((r) => r.cells[i] === "Yes").length;
    const anyone = matrixRows.some((r) => r.cells[i] === "Yes");
    if (anyone) {
      monthsCounted += 1;
      rateSum += H > 0 ? (yesCount / H) * 100 : 0;
    }
  }
  const submissionRate = monthsCounted > 0 ? rateSum / monthsCounted : 0;

  return {
    generatedAt: new Date().toISOString(),
    fhirBase: (process.env.FHIR_BASE_URL || "https://cdr.pheref.fhirlab.net/fhir").replace(/\/+$/, ""),
    reportingYear,
    totals: {
      coordinated,
      successful,
      declined: declinedCount,
      pending,
      successRate: pct(successful, coordinated),
      declinedRate: pct(declinedCount, coordinated),
      submissionRate,
    },
    quarters,
    causes,
    edges,
    outgoing,
    incoming,
    topReferring,
    declined,
    declinedReasonAvailable,
    matrix: { months: MONTH_LABELS, rows: matrixRows },
    diagnostics: {
      serviceRequests: srs.length,
      tasks: tasks.length,
      organizations: orgs.length,
      unresolvedSenders,
      unresolvedReceivers,
      missingMonth,
      taskStatusCounts,
    },
  };
}

// Build a short label from a facility name for compact matrix rows.
function abbreviate(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, "").trim();
  if (cleaned.length <= 14) return cleaned;
  const words = cleaned.split(/[\s\-]+/).filter(Boolean);
  const acro = words
    .filter((w) => /^[A-Za-z]/.test(w) && w[0] === w[0].toUpperCase())
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return acro.length >= 2 ? acro.slice(0, 6) : cleaned.slice(0, 14);
}
