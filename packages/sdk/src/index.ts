// ---------------------------------------------------------------------------
// ARP SDK — typed JavaScript/TypeScript client for the Targon Nexus API
// ---------------------------------------------------------------------------
//
// Quick-start:
//   import { ARPClient } from "@arp/sdk";
//   const arp = new ARPClient({ baseURL: "https://api.arpes.network/v1" });
//   const results = await arp.search("Z.-X. Shen", "person");
//   const person  = await arp.getPerson(results.items[0].uuid);
//
// API surface:
//   search, autocomplete
//   getPerson, getPersonStudents, getPersonAdvisor, getPersonColleagues
//   getLab, getLabMembers, getLabAlumni
//   getUniversity, getDepartment, getSchool
//   getResearchDirection, getResearchDirectionPeople
//   getEquipment, getEquipmentLab
//   getPaper, getPaperAuthors, getPaperCitations
//   graphQuery
//   getTimeline, getTimelineForEntity
//   createEvidence, getEvidence
// ---------------------------------------------------------------------------

import { EntityType, RelationshipType, ConfidenceLevel } from "@arp/types";
import type {
  Person,
  Lab,
  University,
  School,
  Department,
  ResearchDirection,
  Equipment,
  Paper,
  Company,
  Source,
  SearchResult,
  PaginatedResponse,
  GraphQueryResult,
  TimelineEvent,
  Evidence,
} from "@arp/types";

// ===========================================================================
// Client configuration
// ===========================================================================

export interface ARPClientConfig {
  /** Base URL of the Targon Nexus API (e.g. "https://api.arpes.network/v1"). */
  baseURL: string;

  /** Optional API key for authenticated endpoints. */
  apiKey?: string;

  /** Request timeout in milliseconds (default 30_000). */
  timeout?: number;

  /** Custom fetch implementation (e.g. for Node < 18 or testing). */
  fetch?: typeof fetch;
}

/**
 * Pluralization lookup — maps EntityType to the URL path segment.
 * Default rule appends 's', but English irregulars need overrides.
 */
const ENTITY_PATH_SEGMENTS: Partial<Record<EntityType, string>> = {
  university: "universities",
  company: "companies",
};

function entityPath(entityType: EntityType): string {
  return ENTITY_PATH_SEGMENTS[entityType] ?? `${entityType}s`;
}

// ===========================================================================
// Request helpers
// ===========================================================================

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

// ===========================================================================
// ARPClient
// ===========================================================================

export class ARPClient {
  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly customFetch: typeof fetch;

  constructor(config: ARPClientConfig) {
    this.baseURL = config.baseURL.replace(/\/+$/, ""); // strip trailing slashes
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
    this.customFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // -- Low-level request --------------------------------------------------

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, params, signal } = opts;

    const url = new URL(`${this.baseURL}${path}`);
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const mergedSignal = signal
      ? anySignal([signal, controller.signal])
      : controller.signal;

    try {
      const res = await this.customFetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: mergedSignal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new ARPError(
          `Targon Nexus API error ${res.status}: ${res.statusText}`,
          res.status,
          errorBody,
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // =========================================================================
  // Search
  // =========================================================================

  /**
   * Full-text / hybrid search across the knowledge graph.
   *
   * @param q       – Natural-language query string.
   * @param type    – Optional entity-type filter.
   * @param page    – Page number (1-based).
   * @param limit   – Results per page (default 20, max 100).
   * @param signal  – AbortSignal for request cancellation.
   */
  async search(
    q: string,
    type?: EntityType,
    page: number = 1,
    limit: number = 20,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<SearchResult>> {
    return this.request<PaginatedResponse<SearchResult>>("/search", {
      params: { q, type, page, limit },
      signal,
    });
  }

  /**
   * Autocomplete / typeahead suggestions.
   */
  async autocomplete(
    q: string,
    type?: EntityType,
    limit: number = 10,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const res = await this.request<PaginatedResponse<SearchResult>>("/search/autocomplete", {
      params: { q, type, limit },
      signal,
    });
    return res.items;
  }

  // =========================================================================
  // Person
  // =========================================================================

  /** Fetch a Person by UUID. */
  async getPerson(uuid: string, signal?: AbortSignal): Promise<Person> {
    return this.request<Person>(`/persons/${encodeURIComponent(uuid)}`, { signal });
  }

  /** Fetch a person's students (advisees). */
  async getPersonStudents(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/persons/${encodeURIComponent(uuid)}/students`,
      { signal },
    );
  }

  /** Fetch a person's advisor(s). */
  async getPersonAdvisor(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<Person[]> {
    return this.request<Person[]>(
      `/persons/${encodeURIComponent(uuid)}/advisor`,
      { signal },
    );
  }

  /** Fetch frequent collaborators of a person. */
  async getPersonColleagues(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/persons/${encodeURIComponent(uuid)}/colleagues`,
      { signal },
    );
  }

  // =========================================================================
  // Lab
  // =========================================================================

  /** Fetch a Lab by UUID. */
  async getLab(uuid: string, signal?: AbortSignal): Promise<Lab> {
    return this.request<Lab>(`/labs/${encodeURIComponent(uuid)}`, { signal });
  }

  /** Fetch current members of a lab. */
  async getLabMembers(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/labs/${encodeURIComponent(uuid)}/members`,
      { signal },
    );
  }

  /** Fetch alumni (former members) of a lab. */
  async getLabAlumni(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/labs/${encodeURIComponent(uuid)}/alumni`,
      { signal },
    );
  }

  // =========================================================================
  // University / Organisation
  // =========================================================================

  /** Fetch a University by UUID. */
  async getUniversity(uuid: string, signal?: AbortSignal): Promise<University> {
    return this.request<University>(`/${entityPath(EntityType.University)}/${encodeURIComponent(uuid)}`, {
      signal,
    });
  }

  /** Fetch a Department by UUID. */
  async getDepartment(uuid: string, signal?: AbortSignal): Promise<Department> {
    return this.request<Department>(`/${entityPath(EntityType.Department)}/${encodeURIComponent(uuid)}`, {
      signal,
    });
  }

  /** Fetch a School / College by UUID. */
  async getSchool(uuid: string, signal?: AbortSignal): Promise<School> {
    return this.request<School>(`/${entityPath(EntityType.School)}/${encodeURIComponent(uuid)}`, {
      signal,
    });
  }

  // =========================================================================
  // Research Direction
  // =========================================================================

  /** Fetch a ResearchDirection by UUID. */
  async getResearchDirection(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<ResearchDirection> {
    return this.request<ResearchDirection>(
      `/research-directions/${encodeURIComponent(uuid)}`,
      { signal },
    );
  }

  /** Fetch people associated with a research direction. */
  async getResearchDirectionPeople(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/research-directions/${encodeURIComponent(uuid)}/people`,
      { signal },
    );
  }

  // =========================================================================
  // Equipment
  // =========================================================================

  /** Fetch Equipment by UUID. */
  async getEquipment(uuid: string, signal?: AbortSignal): Promise<Equipment> {
    return this.request<Equipment>(`/equipment/${encodeURIComponent(uuid)}`, {
      signal,
    });
  }

  /** Fetch the lab that owns / operates a piece of equipment. */
  async getEquipmentLab(uuid: string, signal?: AbortSignal): Promise<Lab> {
    return this.request<Lab>(
      `/equipment/${encodeURIComponent(uuid)}/lab`,
      { signal },
    );
  }

  // =========================================================================
  // Paper
  // =========================================================================

  /** Fetch a Paper by DOI. */
  async getPaper(doi: string, signal?: AbortSignal): Promise<Paper> {
    return this.request<Paper>(`/papers/doi/${encodeURIComponent(doi)}`, {
      signal,
    });
  }

  /** Fetch the authors of a paper. */
  async getPaperAuthors(
    doi: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Person>> {
    return this.request<PaginatedResponse<Person>>(
      `/papers/doi/${encodeURIComponent(doi)}/authors`,
      { signal },
    );
  }

  /** Fetch papers that cite the given paper. */
  async getPaperCitations(
    doi: string,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<Paper>> {
    return this.request<PaginatedResponse<Paper>>(
      `/papers/doi/${encodeURIComponent(doi)}/citations`,
      { signal },
    );
  }

  // =========================================================================
  // Knowledge Graph — natural-language query
  // =========================================================================

  /**
   * Execute a natural-language graph query.
   *
   * Example queries:
   *   "Who are Z.-X. Shen's postdocs?"
   *   "Show me all ARPES labs in China"
   *   "Path from Shancai Wang to Zhi-Xun Shen"
   *
   * @param q       – Natural-language graph query.
   * @param signal  – AbortSignal for cancellation.
   * @returns       – Structured graph query result with nodes & edges.
   */
  async graphQuery(
    q: string,
    signal?: AbortSignal,
  ): Promise<GraphQueryResult> {
    return this.request<GraphQueryResult>("/graph/query", {
      method: "POST",
      body: { query: q },
      signal,
    });
  }

  // =========================================================================
  // Timeline
  // =========================================================================

  /**
   * Get a chronological timeline for an entity.
   *
   * @param entityType – Type of entity (person, lab, equipment, etc.).
   * @param uuid       – UUID of the entity.
   * @param signal     – AbortSignal for cancellation.
   */
  async getTimeline(
    entityType: EntityType,
    uuid: string,
    signal?: AbortSignal,
  ): Promise<TimelineEvent[]> {
    return this.request<TimelineEvent[]>(
      `/${entityPath(entityType)}/${encodeURIComponent(uuid)}/timeline`,
      { signal },
    );
  }

  // =========================================================================
  // Evidence
  // =========================================================================

  /** Submit an evidence record (authenticated). */
  async createEvidence(
    evidence: Omit<Evidence, "uuid" | "createdAt">,
    signal?: AbortSignal,
  ): Promise<Evidence> {
    return this.request<Evidence>("/evidence", {
      method: "POST",
      body: evidence,
      signal,
    });
  }

  /** Fetch an evidence record by UUID. */
  async getEvidence(uuid: string, signal?: AbortSignal): Promise<Evidence> {
    return this.request<Evidence>(`/evidence/${encodeURIComponent(uuid)}`, {
      signal,
    });
  }
}

// ===========================================================================
// Error type
// ===========================================================================

export class ARPError extends Error {
  public readonly statusCode: number;
  public readonly body: string;

  constructor(message: string, statusCode: number, body: string) {
    super(message);
    this.name = "ARPError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

// ===========================================================================
// Re-export types for consumer convenience
// ===========================================================================

export { EntityType, RelationshipType, ConfidenceLevel } from "@arp/types";
export type {
  // Domain
  Person,
  Lab,
  University,
  School,
  Department,
  ResearchDirection,
  Equipment,
  Paper,
  Company,
  Source,
  // API
  SearchResult,
  PaginatedResponse,
  GraphQueryResult,
  TimelineEvent,
  Evidence,
} from "@arp/types";

// ===========================================================================
// Internal helper — poor-person's AbortSignal.any (widely available in
// modern runtimes, but polyfill for Node < 20).
// ===========================================================================

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }

  const onAbort = (reason: unknown) => {
    controller.abort(reason);
    // Clean up all listeners once any signal fires
    for (const s of signals) {
      s.removeEventListener("abort", onAbort);
    }
  };

  for (const signal of signals) {
    signal.addEventListener("abort", onAbort);
  }

  // If the merged controller itself is aborted (via timeout), clean up
  controller.signal.addEventListener("abort", () => {
    for (const s of signals) {
      s.removeEventListener("abort", onAbort);
    }
  }, { once: true });

  return controller.signal;
}
