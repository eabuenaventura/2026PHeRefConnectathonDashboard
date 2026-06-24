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
  const raw = process.env.FHIR_BASE_URL || "https://cdr.fhirlab.net/fhir";
  return raw.replace(/\/+$/, "");
}

/**
 * Fetch every resource of a type, following Bundle `next` links.
 * Runs server-side (Node/Vercel) where there are no CORS or allowlist limits.
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
      if (e && e.resource) all.push(e.resource);
    });
    const next = (bundle.link || []).find((l) => l.relation === "next");
    // Normalise next links to https to avoid mixed-content / proxy issues.
    url = next ? next.url.replace(/^http:/, "https:") : null;
  }
  return all;
}
