// Minimal FHIR R4 types and a paginated server-side fetch client.
// Only the elements used by the dashboard are typed; everything else is loose.

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}
export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}
export interface Identifier {
  system?: string;
  value?: string;
}
export interface Reference {
  reference?: string;
  display?: string;
}

export interface Organization {
  resourceType: "Organization";
  id: string;
  name?: string;
  identifier?: Identifier[];
  type?: CodeableConcept[];
}
export interface PractitionerRole {
  resourceType: "PractitionerRole";
  id: string;
  practitioner?: Reference;
  organization?: Reference;
}
export interface ServiceRequest {
  resourceType: "ServiceRequest";
  id: string;
  status?: string;
  intent?: string;
  priority?: string;
  authoredOn?: string;
  requester?: Reference;
  performer?: Reference[];
  category?: CodeableConcept[];
  code?: CodeableConcept;
  reasonCode?: CodeableConcept[];
  subject?: Reference;
}
export interface Task {
  resourceType: "Task";
  id: string;
  status?: string;
  focus?: Reference;
  owner?: Reference;
  requester?: Reference;
  statusReason?: CodeableConcept;
  authoredOn?: string;
}
export interface Provenance {
  resourceType: "Provenance";
  id: string;
  recorded?: string;
  target?: Reference[];
  agent?: { who?: Reference }[];
}

interface Bundle<T> {
  resourceType: "Bundle";
  total?: number;
  entry?: { resource: T }[];
  link?: { relation: string; url: string }[];
}

export function baseUrl(): string {
  // NEXT_PUBLIC_ is required so the value is available in the browser,
  // since the dashboard now fetches FHIR directly from the client.
  const raw =
    process.env.NEXT_PUBLIC_FHIR_BASE_URL || "https://cdr.pheref.fhirlab.net/fhir";
  return raw.replace(/\/+$/, "");
}

// HAPI MDM marks merged "golden"/master records with these meta tags. They are
// synthetic aggregates and would double-count, so we drop them everywhere.
//   http://hapifhir.io/fhir/NamingSystem/mdm-record-status  -> GOLDEN_RECORD
//   https://hapifhir.org/NamingSystem/managing-mdm-system   -> HAPI-MDM
const MDM_GOLDEN_RE = /golden[_\s-]?record|hapi-mdm/i;

export function isGoldenRecord(resource: unknown): boolean {
  const meta = (resource as { meta?: { tag?: Coding[]; security?: Coding[] } })?.meta;
  if (!meta) return false;
  const tags = [...(meta.tag || []), ...(meta.security || [])];
  return tags.some((t) => MDM_GOLDEN_RE.test(`${t?.code || ""} ${t?.display || ""}`));
}

/**
 * Fetch every resource of a type, following Bundle `next` links.
 * Runs in the browser (client-side); the FHIR server must allow CORS.
 * MDM golden/master records are filtered out (see isGoldenRecord).
 */
export async function fetchAll<T>(
  type: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const base = baseUrl();
  const qs = new URLSearchParams({ _count: "200", ...params }).toString();
  let url: string | null = `${base}/${type}?${qs}`;
  const all: T[] = [];
  let guard = 0;

  while (url && guard < 25) {
    guard += 1;
    const res: Response = await fetch(url, {
      headers: { Accept: "application/fhir+json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`FHIR ${type} fetch failed: ${res.status} ${res.statusText}`);
    }
    const bundle = (await res.json()) as Bundle<T>;
    (bundle.entry || []).forEach((e) => {
      if (e && e.resource && !isGoldenRecord(e.resource)) all.push(e.resource);
    });
    const next = (bundle.link || []).find((l) => l.relation === "next");
    // Normalise next links to https to avoid mixed-content / proxy issues.
    url = next ? next.url.replace(/^http:/, "https:") : null;
  }
  return all;
}
