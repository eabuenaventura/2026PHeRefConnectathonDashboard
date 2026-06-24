import { getDashboardData, DashboardData } from "@/lib/metrics";
import {
  QuarterBars,
  CausesBars,
  OutInBars,
  TopReferringBars,
  DeclinedBars,
} from "@/components/Charts";
import RefreshButton from "@/components/RefreshButton";

// Always render fresh against the live FHIR server.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function KpiCard({
  label,
  figure,
  unit,
  caption,
}: {
  label: string;
  figure: string;
  unit?: string;
  caption: string;
}) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="figure">
        {figure}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      <div className="caption">{caption}</div>
    </div>
  );
}

function EdgeList({ data }: { data: DashboardData["edges"] }) {
  const rows = data.slice(0, 12);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="edge-list">
      {rows.map((r, i) => (
        <div className="edge-row" key={i}>
          <span className="lab" title={r.label}>
            {r.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="val">{r.value}</span>
        </div>
      ))}
      {rows.length === 0 ? (
        <div className="note">No directed pairs with resolvable institutions.</div>
      ) : null}
    </div>
  );
}

function SubmissionMatrix({
  matrix,
  year,
}: {
  matrix: DashboardData["matrix"];
  year: number;
}) {
  return (
    <div>
      <div className="legend">
        <span className="item">
          <span className="swatch" style={{ background: "var(--teal)" }} /> Encoded
        </span>
        <span className="item">
          <span className="swatch" style={{ background: "var(--amber)" }} /> Not complete
        </span>
        <span className="item">
          <span className="swatch" style={{ background: "var(--red)" }} /> No
        </span>
      </div>
      <div className="matrix">
        <table>
          <thead>
            <tr>
              <th className="facility">Facility</th>
              {matrix.months.map((m) => (
                <th key={m}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.fullName}>
                <td className="facility" title={row.fullName}>
                  {row.name}
                </td>
                {row.cells.map((c, i) => (
                  <td key={i}>
                    <div
                      className={`cell ${
                        c === "Yes" ? "yes" : c === "Not complete" ? "amber" : "no"
                      }`}
                      title={`${row.fullName} — ${matrix.months[i]} ${year} (month-end): ${c}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="facility-key">
        {matrix.rows.map((r) => (
          <div key={r.fullName}>
            <b>{r.name}</b> — {r.fullName}
          </div>
        ))}
      </div>
      <div className="note">
        Operational proxy: submission status is reporting metadata with no FHIR element
        (spec §FHIR). A facility is shown Encoded for a month if it originated referral
        activity (ServiceRequest.requester) or signed a Provenance recorded that month.
      </div>
    </div>
  );
}

async function Dashboard() {
  let data: DashboardData;
  try {
    data = await getDashboardData();
  } catch (err) {
    return (
      <div className="wrap">
        <div className="banner">
          Could not load data from the FHIR server (
          <code>{process.env.FHIR_BASE_URL || "FHIR_BASE_URL not set"}</code>).
          <br />
          {String(err instanceof Error ? err.message : err)}
        </div>
      </div>
    );
  }

  const t = data.totals;
  const fmt = (n: number) => n.toLocaleString();
  const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}`;

  return (
    <div className="wrap">
      <div className="dash-header">
        <div>
          <h1>Aklan Referral Monitoring Dashboard</h1>
          <div className="sub">
            Provincial Health Office · PHeRef Connectathon · CY {data.reportingYear} · live FHIR R4
          </div>
        </div>
        <div className="header-right">
          <RefreshButton />
          <div className="meta">
            Source: {data.fhirBase}
            <br />
            Updated {new Date(data.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Row 1 — four KPI cards */}
      <div className="grid row-kpi">
        <KpiCard
          label="Coordinated Referrals"
          figure={fmt(t.coordinated)}
          caption="Total coordinated ServiceRequests (eq. Coord)"
        />
        <KpiCard
          label="Successful referral rate"
          figure={pct(t.successRate)}
          unit="%"
          caption={`${fmt(t.successful)} received of ${fmt(t.coordinated)}`}
        />
        <KpiCard
          label="Declined referral rate"
          figure={pct(t.declinedRate)}
          unit="%"
          caption={`${fmt(t.declined)} declined · ${fmt(t.pending)} pending`}
        />
        <KpiCard
          label="Report Submission Rate"
          figure={pct(t.submissionRate)}
          unit="%"
          caption="Avg. monthly hospital submissions (proxy)"
        />
      </div>

      {/* Row 2 — quarter + leading causes */}
      <div className="grid row-2">
        <div className="card">
          <h2>Coordinated referrals by quarter</h2>
          <QuarterBars data={data.quarters} />
          <div className="note">* partial quarter — not all three months reported yet.</div>
        </div>
        <div className="card">
          <h2>Leading causes of referral</h2>
          <CausesBars data={data.causes} />
        </div>
      </div>

      {/* Row 3 — referral directionality (full width) */}
      <div className="grid row-1">
        <div className="card">
          <h2>Referral directionality (coordinated, YTD)</h2>
          <EdgeList data={data.edges} />
        </div>
      </div>

      {/* Row 4 — outgoing + incoming */}
      <div className="grid row-2">
        <div className="card">
          <h2>Outgoing referrals</h2>
          <div className="legend">
            <span className="item">
              <span className="swatch" style={{ background: "var(--teal)" }} /> Successful
            </span>
            <span className="item">
              <span className="swatch" style={{ background: "var(--quarter)" }} /> Pending
            </span>
            <span className="item">
              <span className="swatch" style={{ background: "var(--red)" }} /> Declined
            </span>
          </div>
          <OutInBars data={data.outgoing} split />
        </div>
        <div className="card">
          <h2>Incoming referrals</h2>
          <OutInBars data={data.incoming} />
        </div>
      </div>

      {/* Row 5 — top referring + declined reasons */}
      <div className="grid row-2">
        <div className="card">
          <h2>Top referring facilities</h2>
          <div className="legend">
            <span className="item">
              <span className="swatch" style={{ background: "var(--accent)" }} /> Hospital
            </span>
            <span className="item">
              <span className="swatch" style={{ background: "var(--teal)" }} /> PCF
            </span>
          </div>
          <TopReferringBars data={data.topReferring} />
        </div>
        <div className="card">
          <h2>Top reasons for declined / unsuccessful</h2>
          <DeclinedBars data={data.declined} />
          {!data.declinedReasonAvailable ? (
            <div className="note">
              Breakdown by reason needs <code>Task.statusReason</code> (outside mapping v0.1);
              showing total declined only.
            </div>
          ) : null}
        </div>
      </div>

      {/* Row 6 — submission status matrix (full width) */}
      <div className="grid row-1">
        <div className="card">
          <h2>Report submission status — hospitals (by month-end)</h2>
          <SubmissionMatrix matrix={data.matrix} year={data.reportingYear} />
        </div>
      </div>

      <div className="diag">
        Diagnostics — ServiceRequests: {data.diagnostics.serviceRequests} · Tasks:{" "}
        {data.diagnostics.tasks} · Organizations: {data.diagnostics.organizations} · unresolved
        senders: {data.diagnostics.unresolvedSenders} · unresolved receivers:{" "}
        {data.diagnostics.unresolvedReceivers} · missing month: {data.diagnostics.missingMonth}.
        Task statuses:{" "}
        {Object.entries(data.diagnostics.taskStatusCounts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ") || "none"}
        .
      </div>
    </div>
  );
}

export default function Page() {
  return <Dashboard />;
}
