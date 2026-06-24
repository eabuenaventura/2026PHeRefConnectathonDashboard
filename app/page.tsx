"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDashboardData, DashboardData } from "@/lib/metrics";
import { baseUrl } from "@/lib/fhir";
import {
  QuarterBars,
  CausesBars,
  OutInBars,
  TopReferringBars,
  DeclinedBars,
} from "@/components/Charts";
import RefreshButton from "@/components/RefreshButton";
import ThemeToggle from "@/components/ThemeToggle";
import CountUp from "@/components/CountUp";
import RelativeTime from "@/components/RelativeTime";

/* ---------- small inline icons ---------- */
const Ico = {
  coord: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  x: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  doc: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6l4 4v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  ),
};

/* ---------- KPI ---------- */
function KpiCard({
  label,
  value,
  decimals = 0,
  unit,
  caption,
  color,
  icon,
}: {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
  caption: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card kpi">
      <span className="accent-bar" style={{ background: color }} />
      <div className="kpi-top">
        <div className="label">{label}</div>
        <div className="badge" style={{ background: color }}>
          {icon}
        </div>
      </div>
      <div className="figure">
        <CountUp value={value} decimals={decimals} unit={unit} />
      </div>
      <div className="caption">{caption}</div>
    </div>
  );
}

function EdgeList({ data }: { data: DashboardData["edges"] }) {
  const rows = data.slice(0, 12);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0)
    return <div className="empty">No directed pairs with resolvable institutions.</div>;
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
  if (matrix.rows.length === 0)
    return <div className="empty">No hospital facilities active in referrals yet.</div>;
  return (
    <div>
      <div className="legend">
        <span className="item"><span className="swatch" style={{ background: "var(--teal)" }} /> Encoded</span>
        <span className="item"><span className="swatch" style={{ background: "var(--amber)" }} /> Not complete</span>
        <span className="item"><span className="swatch" style={{ background: "var(--red)" }} /> No</span>
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
                      className={`cell ${c === "Yes" ? "yes" : c === "Not complete" ? "amber" : "no"}`}
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

/* ---------- skeleton ---------- */
function SkeletonDashboard() {
  return (
    <>
      <div className="grid row-kpi">
        {[0, 1, 2, 3].map((i) => (
          <div className="card kpi" key={i}>
            <div className="skel skel-line" style={{ width: "55%" }} />
            <div className="skel skel-fig" />
            <div className="skel skel-line" style={{ width: "70%", marginTop: 18 }} />
          </div>
        ))}
      </div>
      <div className="grid row-2">
        <div className="card"><div className="skel skel-line" style={{ width: "40%" }} /><div className="skel skel-chart" /></div>
        <div className="card"><div className="skel skel-line" style={{ width: "40%" }} /><div className="skel skel-chart" /></div>
      </div>
      <div className="grid row-1">
        <div className="card"><div className="skel skel-line" style={{ width: "30%" }} /><div className="skel skel-chart" style={{ height: 150 }} /></div>
      </div>
    </>
  );
}

const AUTO_MS = 60000;

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboardData());
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh interval.
  useEffect(() => {
    if (auto) {
      timer.current = setInterval(load, AUTO_MS);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [auto, load]);

  const source = baseUrl();
  const dotClass = loading ? "dot loading" : error ? "dot error" : "dot";
  const statusText = loading ? "Updating" : error ? "Error" : "Live";

  return (
    <div className="wrap">
      <div className="dash-header">
        <div className="brand">
          <div className="logos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/up-seal.png" alt="University of the Philippines" width={44} height={44} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/nthc-seal.png" alt="National Telehealth Center" width={44} height={44} />
          </div>
          <div>
            <h1>Aklan Referral Monitoring Dashboard</h1>
            <div className="sub">
              Provincial Health Office · PHeRef Connectathon ·{" "}
              {data ? `CY ${data.reportingYear} · ` : ""}live FHIR R4 (client-side)
            </div>
          </div>
        </div>

        <div className="header-right">
          <span className="live">
            <span className={dotClass} /> {statusText}
          </span>
          <label className="switch" title={`Auto-refresh every ${AUTO_MS / 1000}s`}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto
          </label>
          <RefreshButton onClick={load} busy={loading} />
          <ThemeToggle />
        </div>
      </div>

      <div className="meta" style={{ textAlign: "left", marginTop: -14, marginBottom: 18 }}>
        <span className="src">{source}</span>
        {" · "}
        {data ? <RelativeTime since={data.generatedAt} /> : loading ? "Loading…" : ""}
      </div>

      {error ? (
        <div className="banner">
          <strong>Could not load data</strong> from <code>{source}</code>.
          <br />
          {error}
          <br />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            If this is a CORS error, the FHIR server must allow cross-origin requests from
            this site&apos;s domain.
          </span>
        </div>
      ) : null}

      {!data ? loading ? <SkeletonDashboard /> : <div className="empty">No data.</div> : <Panels data={data} />}
    </div>
  );
}

function Panels({ data }: { data: DashboardData }) {
  const t = data.totals;
  const fmt = (n: number) => n.toLocaleString();
  const rateDecimals = (n: number) => (n >= 100 ? 0 : 1);
  return (
    <>
      {/* Row 1 — KPI cards */}
      <div className="grid row-kpi">
        <KpiCard
          label="Coordinated Referrals"
          value={t.coordinated}
          caption="Total coordinated ServiceRequests"
          color="var(--accent)"
          icon={Ico.coord}
        />
        <KpiCard
          label="Successful referral rate"
          value={t.successRate}
          decimals={rateDecimals(t.successRate)}
          unit="%"
          caption={`${fmt(t.successful)} received of ${fmt(t.coordinated)}`}
          color="var(--teal)"
          icon={Ico.check}
        />
        <KpiCard
          label="Declined referral rate"
          value={t.declinedRate}
          decimals={rateDecimals(t.declinedRate)}
          unit="%"
          caption={`${fmt(t.declined)} declined · ${fmt(t.pending)} pending`}
          color="var(--red)"
          icon={Ico.x}
        />
        <KpiCard
          label="Report Submission Rate"
          value={t.submissionRate}
          decimals={rateDecimals(t.submissionRate)}
          unit="%"
          caption="Avg. monthly hospital submissions (proxy)"
          color="var(--amber)"
          icon={Ico.doc}
        />
      </div>

      {/* Row 2 */}
      <div className="grid row-2">
        <div className="card">
          <h2>Coordinated referrals by quarter <span className="tag">eq. quarter</span></h2>
          <QuarterBars data={data.quarters} />
          <div className="note">* partial quarter — not all three months reported yet.</div>
        </div>
        <div className="card">
          <h2>Leading causes of referral <span className="tag">top 5</span></h2>
          <CausesBars data={data.causes} />
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid row-1">
        <div className="card">
          <h2>Referral directionality <span className="tag">coordinated · YTD</span></h2>
          <EdgeList data={data.edges} />
        </div>
      </div>

      {/* Row 4 */}
      <div className="grid row-2">
        <div className="card">
          <h2>Outgoing referrals <span className="tag">by sender</span></h2>
          <div className="legend">
            <span className="item"><span className="swatch" style={{ background: "var(--teal)" }} /> Successful</span>
            <span className="item"><span className="swatch" style={{ background: "var(--quarter)" }} /> Pending</span>
            <span className="item"><span className="swatch" style={{ background: "var(--red)" }} /> Declined</span>
          </div>
          <OutInBars data={data.outgoing} split />
        </div>
        <div className="card">
          <h2>Incoming referrals <span className="tag">by receiver</span></h2>
          <OutInBars data={data.incoming} />
        </div>
      </div>

      {/* Row 5 */}
      <div className="grid row-2">
        <div className="card">
          <h2>Top referring facilities</h2>
          <div className="legend">
            <span className="item"><span className="swatch" style={{ background: "var(--hospital)" }} /> Hospital</span>
            <span className="item"><span className="swatch" style={{ background: "var(--teal)" }} /> PCF</span>
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

      {/* Row 6 */}
      <div className="grid row-1">
        <div className="card">
          <h2>Report submission status — hospitals (by month-end) <span className="tag">proxy</span></h2>
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
    </>
  );
}
