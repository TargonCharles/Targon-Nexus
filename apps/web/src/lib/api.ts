// API response types — these are the REST-flattened projections returned by
// the NestJS endpoints. They differ from the canonical @arp/types domain
// entities (which include nested arrays, source references, timestamps, etc.).
// We keep these separate because the API deliberately simplifies the shape.

export interface PersonResponse {
  uuid: string;
  chineseName?: string;
  englishName?: string;
  currentStatus?: string;
  researchInterests?: string[];
  lab?: { name: string; englishName?: string; uuid: string; country?: string; city?: string } | null;
  university?: { chineseName?: string; englishName?: string; uuid: string; country?: string } | null;
  biography?: string;
  aliases?: string[];
}

export interface LabResponse {
  uuid: string;
  name: string;
  englishName?: string;
  abbreviation?: string;
  description?: string;
  country?: string;
  city?: string;
  currentStatus?: string;
  keywords?: string[];
  university?: { chineseName?: string; englishName?: string; uuid: string } | null;
}

export interface SearchResult {
  uuid: string;
  type: 'person' | 'lab' | 'university' | 'equipment' | 'research_direction' | 'paper';
  name: string;
  subtitle?: string;
  labels: string[];
  score?: number;
}

export interface GraphData {
  nodes: Array<{ uuid: string; name: string; type: string; [key: string]: unknown }>;
  edges: Array<{ source: string; target: string; type: string; [key: string]: unknown }>;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number };
  error?: { code: string; message: string };
}

async function fetchApi<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message ?? `API Error: ${res.status}`;
    const err = new Error(message) as Error & { status: number };
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

// -- API methods ------------------------------------------------------------

export async function search(q: string, type?: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({ q });
  if (type) params.set('type', type);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return fetchApi<SearchResult[]>(`/search?${params}`);
}

export async function getPerson(uuid: string) {
  return fetchApi<any>(`/persons/${uuid}`);
}

export async function getPersonStudents(uuid: string) {
  return fetchApi<any[]>(`/persons/${uuid}/students`);
}

export async function getPersonAdvisors(uuid: string) {
  return fetchApi<any[]>(`/persons/${uuid}/advisors`);
}

export async function getPersonGraph(uuid: string) {
  return fetchApi<GraphData>(`/persons/${uuid}/graph`);
}

export async function getPersonGenealogy(uuid: string) {
  return fetchApi<GraphData>(`/persons/${uuid}/genealogy`);
}

export async function getLab(uuid: string) {
  return fetchApi<any>(`/labs/${uuid}`);
}

export async function getLabMembers(uuid: string) {
  return fetchApi<any[]>(`/labs/${uuid}/members`);
}

export async function getLabDirections(uuid: string) {
  return fetchApi<any[]>(`/labs/${uuid}/directions`);
}

export async function getLabGraph(uuid: string) {
  return fetchApi<GraphData>(`/labs/${uuid}/graph`);
}

export async function getEquipment(uuid: string) {
  return fetchApi<any>(`/equipment/${uuid}`);
}

export async function getEquipmentLabs(uuid: string) {
  return fetchApi<any[]>(`/equipment/${uuid}/labs`);
}

export async function getEquipmentGraph(uuid: string) {
  return fetchApi<GraphData>(`/equipment/${uuid}/graph`);
}

export async function getDirection(uuid: string) {
  return fetchApi<any>(`/directions/${uuid}`);
}

export async function getDirectionPeople(uuid: string) {
  return fetchApi<any[]>(`/directions/${uuid}/people`);
}

export async function getDirectionLabs(uuid: string) {
  return fetchApi<any[]>(`/directions/${uuid}/labs`);
}

export async function getDirectionGraph(uuid: string) {
  return fetchApi<GraphData>(`/directions/${uuid}/graph`);
}

// -- Paper API methods --------------------------------------------------------

export async function getPaper(uuid: string) {
  return fetchApi<any>(`/papers/${uuid}`);
}

export async function getPaperAuthors(uuid: string) {
  return fetchApi<any[]>(`/papers/${uuid}/authors`);
}

export async function getPaperCitations(uuid: string, page = 1, pageSize = 20) {
  return fetchApi<any[]>(`/papers/${uuid}/citations?page=${page}&pageSize=${pageSize}`);
}

export async function getPaperReferences(uuid: string, page = 1, pageSize = 20) {
  return fetchApi<any[]>(`/papers/${uuid}/references?page=${page}&pageSize=${pageSize}`);
}

export async function getPaperCitationGraph(uuid: string, depth = 1) {
  return fetchApi<GraphData>(`/papers/${uuid}/citation-graph?depth=${depth}`);
}

// -- Quality API methods ----------------------------------------------------

export async function getPersonCareer(uuid: string) {
  return fetchApi<any>(`/quality/career/${uuid}`);
}

export async function getQualityReport() {
  return fetchApi<any>('/quality/report');
}

// -- Facility API methods ----------------------------------------------------

export async function getFacility(uuid: string) {
  return fetchApi<any>(`/facilities/${uuid}`);
}

export async function getFacilityGraph(uuid: string) {
  return fetchApi<GraphData>(`/facilities/${uuid}/graph`);
}

export async function listFacilities(country?: string) {
  const query = country ? `?country=${encodeURIComponent(country)}` : '';
  return fetchApi<any[]>(`/facilities${query}`);
}
