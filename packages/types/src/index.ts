// ---------------------------------------------------------------------------
// ARP Types — barrel export
// ---------------------------------------------------------------------------
// Canonical TypeScript type definitions shared across all ARP packages.
// No runtime code — pure type declarations (const enums are inlined).
//
// Sections:
//   1. Primitives & helpers
//   2. Enums / discriminated unions
//   3. Domain entities
//   4. API contracts
//   5. Agent / pipeline events
// ---------------------------------------------------------------------------

// ===========================================================================
// 1. Primitives & helpers
// ===========================================================================

/** UUID v4 string — stored as lowercase with dashes. */
export type UUID = string & { readonly __brand: "UUID" };

/** ISO-8601 datetime string (e.g. "2025-03-15T10:30:00.000Z"). */
export type ISODateTime = string & { readonly __brand: "ISODateTime" };

/** DOI string (e.g. "10.1103/PhysRevLett.123.456789"). */
export type DOI = string & { readonly __brand: "DOI" };

/** ORCID identifier (e.g. "0000-0002-1825-0097"). */
export type ORCID = string & { readonly __brand: "ORCID" };

/** URL string (validated). */
export type Url = string & { readonly __brand: "Url" };

/** A confidence score between 0 and 1 (inclusive). */
export type ConfidenceScore = number & { readonly __brand: "ConfidenceScore" };

// ===========================================================================
// 2. Enums
// ===========================================================================

/** High-level entity category. */
export enum EntityType {
  Person = "person",
  Lab = "lab",
  University = "university",
  School = "school",
  Department = "department",
  ResearchDirection = "research_direction",
  Equipment = "equipment",
  Paper = "paper",
  Company = "company",
  Source = "source",
  Event = "event",
}

/** Academic / professional status of a Person. */
export enum PersonStatus {
  Professor = "professor",
  AssociateProfessor = "associate_professor",
  AssistantProfessor = "assistant_professor",
  Postdoc = "postdoc",
  PhDStudent = "phd_student",
  MasterStudent = "master_student",
  Undergraduate = "undergraduate",
  ResearchStaff = "research_staff",
  Emeritus = "emeritus",
  Industry = "industry",
  Unknown = "unknown",
}

/** Operational status of a Lab. */
export enum LabStatus {
  Active = "active",
  Inactive = "inactive",
  Merged = "merged",
  Dissolved = "dissolved",
  Unknown = "unknown",
}

/** Category of scientific equipment. */
export enum EquipmentCategory {
  ARPES = "arpes",
  MBE = "mbe",
  STM = "stm",
  XRD = "xrd",
  XPS = "xps",
  TEM = "tem",
  SEM = "sem",
  AFM = "afm",
  Cryostat = "cryostat",
  Magnet = "magnet",
  Laser = "laser",
  SynchrotronBeamline = "synchrotron_beamline",
  FEL = "fel",
  Other = "other",
}

/** Relationship type between two knowledge-graph entities. */
export enum RelationshipType {
  WorksAt = "works_at",
  StudiedAt = "studied_at",
  AdvisedBy = "advised_by",
  Advises = "advises",
  CollaboratesWith = "collaborates_with",
  Authored = "authored",
  Owns = "owns",
  Operates = "operates",
  MemberOf = "member_of",
  AlumniOf = "alumni_of",
  AffiliatedWith = "affiliated_with",
  Researches = "researches",
  Cites = "cites",
  CitedBy = "cited_by",
  LocatedAt = "located_at",
  PartOf = "part_of",
  PrecededBy = "preceded_by",
  SucceededBy = "succeeded_by",
  SameAs = "same_as",
}

/** Confidence tier. */
export enum ConfidenceLevel {
  High = "high",
  Medium = "medium",
  Low = "low",
  Unverified = "unverified",
}

/** Event type for timeline entries. */
export enum EventType {
  Publication = "publication",
  Graduation = "graduation",
  Appointment = "appointment",
  Departure = "departure",
  LabFounded = "lab_founded",
  LabClosed = "lab_closed",
  Award = "award",
  Conference = "conference",
  Discovery = "discovery",
  EquipmentInstalled = "equipment_installed",
  EquipmentDecommissioned = "equipment_decommissioned",
  CollaborationStart = "collaboration_start",
  CollaborationEnd = "collaboration_end",
  Other = "other",
}

// ===========================================================================
// 3. Domain entities
// ===========================================================================

// -- Person ------------------------------------------------------------------

export interface Person {
  uuid: UUID;
  name: string;
  nameZh?: string;
  namePinyin?: string;
  aliases: string[];
  title?: string;
  status: PersonStatus;
  email?: string;
  orcid?: ORCID;
  googleScholarId?: string;
  researchGateId?: string;
  homepage?: Url;
  photoUrl?: Url;
  researchInterests: string[];
  bio?: string;
  currentAffiliation?: {
    institutionUUID: UUID;
    institutionName: string;
    departmentUUID?: UUID;
    departmentName?: string;
    labUUID?: UUID;
    labName?: string;
  };
  education: EducationEntry[];
  papers: PaperReference[];
  totalPublications: number;
  hIndex?: number;
  citationCount?: number;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EducationEntry {
  degree: string;
  field: string;
  institutionUUID?: UUID;
  institutionName: string;
  yearStart?: number;
  yearEnd?: number;
}

export interface PaperReference {
  doi: DOI;
  title: string;
  year?: number;
  journal?: string;
  authorPosition?: number;
}

// -- Lab ---------------------------------------------------------------------

export interface Lab {
  uuid: UUID;
  name: string;
  nameZh?: string;
  aliases: string[];
  status: LabStatus;
  description?: string;
  institutionUUID: UUID;
  institutionName: string;
  departmentUUID?: UUID;
  departmentName?: string;
  website?: Url;
  foundedYear?: number;
  researchDirections: ResearchDirectionReference[];
  piUUID?: UUID;
  piName?: string;
  memberCount: number;
  alumniCount: number;
  notableAlumni: NotableAlumniReference[];
  equipment: EquipmentReference[];
  location?: string;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface NotableAlumniReference {
  personUUID: UUID;
  personName: string;
  currentPosition?: string;
  currentInstitution?: string;
  yearsInLab?: string;
}

// -- University ---------------------------------------------------------------

export interface University {
  uuid: UUID;
  name: string;
  nameZh?: string;
  nameNative?: string;
  aliases: string[];
  country: string;
  city?: string;
  website?: Url;
  establishedYear?: number;
  type: string;
  departments: DepartmentReference[];
  schools: SchoolReference[];
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DepartmentReference {
  uuid: UUID;
  name: string;
  nameZh?: string;
}

export interface SchoolReference {
  uuid: UUID;
  name: string;
  nameZh?: string;
}

// -- School ------------------------------------------------------------------

export interface School {
  uuid: UUID;
  name: string;
  nameZh?: string;
  universityUUID: UUID;
  universityName: string;
  departments: DepartmentReference[];
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -- Department ---------------------------------------------------------------

export interface Department {
  uuid: UUID;
  name: string;
  nameZh?: string;
  universityUUID: UUID;
  universityName: string;
  schoolUUID?: UUID;
  schoolName?: string;
  website?: Url;
  labs: LabReference[];
  people: PersonReference[];
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -- Research Direction ------------------------------------------------------

export interface ResearchDirection {
  uuid: UUID;
  name: string;
  nameZh?: string;
  aliases: string[];
  description?: string;
  parentUUID?: UUID;
  parentName?: string;
  keywords: string[];
  relatedPeople: PersonReference[];
  relatedLabs: LabReference[];
  paperCount: number;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ResearchDirectionReference {
  uuid: UUID;
  name: string;
}

// -- Equipment ----------------------------------------------------------------

export interface Equipment {
  uuid: UUID;
  name: string;
  category: EquipmentCategory;
  manufacturer?: string;
  model?: string;
  specifications: Record<string, string>;
  labUUID?: UUID;
  labName?: string;
  location?: string;
  installationYear?: number;
  status: string;
  description?: string;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EquipmentReference {
  uuid: UUID;
  name: string;
  category: EquipmentCategory;
}

// -- Paper -------------------------------------------------------------------

export interface Paper {
  uuid: UUID;
  doi: DOI;
  title: string;
  abstract?: string;
  authors: AuthorReference[];
  journal: string;
  volume?: string;
  issue?: string;
  pages?: string;
  year: number;
  publicationDate?: ISODateTime;
  publisher?: string;
  keywords: string[];
  citationCount: number;
  references: PaperReference[];
  citations: PaperReference[];
  arxivId?: string;
  url?: Url;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AuthorReference {
  personUUID?: UUID;
  name: string;
  affiliationName?: string;
  authorOrder: number;
  isCorresponding: boolean;
}

// -- Company -----------------------------------------------------------------

export interface Company {
  uuid: UUID;
  name: string;
  nameZh?: string;
  aliases: string[];
  industry?: string;
  website?: Url;
  description?: string;
  foundedYear?: number;
  headquarters?: string;
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -- Source ------------------------------------------------------------------

export interface Source {
  uuid: UUID;
  url: Url;
  title?: string;
  sourceType: string;
  publisher?: string;
  retrievedAt: ISODateTime;
  rawContentHash?: string;
  metadata: Record<string, unknown>;
  createdAt: ISODateTime;
}

export interface SourceReference {
  sourceUUID: UUID;
  url: Url;
  title?: string;
  retrievedAt: ISODateTime;
}

// -- Event (timeline entry) --------------------------------------------------

export interface Event {
  uuid: UUID;
  type: EventType;
  title: string;
  description?: string;
  date: ISODateTime;
  datePrecision: "year" | "month" | "day" | "exact";
  relatedEntities: EntityReference[];
  confidence: ConfidenceScore;
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EntityReference {
  uuid: UUID;
  entityType: EntityType;
  name: string;
}

// -- Relationship ------------------------------------------------------------

export interface Relationship {
  uuid: UUID;
  type: RelationshipType;
  sourceEntityUUID: UUID;
  sourceEntityType: EntityType;
  targetEntityUUID: UUID;
  targetEntityType: EntityType;
  label?: string;
  startDate?: ISODateTime;
  endDate?: ISODateTime;
  confidence: ConfidenceScore;
  evidence: EvidenceReference[];
  sources: SourceReference[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ===========================================================================
// Shared reference types (lightweight pointers used across entities)
// ===========================================================================

export interface LabReference {
  uuid: UUID;
  name: string;
}

export interface PersonReference {
  uuid: UUID;
  name: string;
  affiliationName?: string;
}

// ===========================================================================
// 4. API contracts
// ===========================================================================

// -- Search ------------------------------------------------------------------

export interface SearchResult {
  uuid: UUID;
  entityType: EntityType;
  name: string;
  nameZh?: string;
  highlights: Record<string, string[]>;
  confidence: ConfidenceScore;
  relevanceScore: number;
  thumbnail?: {
    affiliation?: string;
    description?: string;
    yearRange?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// -- Graph query -------------------------------------------------------------

export interface GraphQueryResult {
  query: string;
  interpretation: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  path?: GraphPath;
}

export interface GraphNode {
  uuid: UUID;
  entityType: EntityType;
  label: string;
  labelZh?: string;
  properties: Record<string, unknown>;
  confidence: ConfidenceScore;
}

export interface GraphEdge {
  sourceUUID: UUID;
  targetUUID: UUID;
  relationshipType: RelationshipType;
  label?: string;
  confidence: ConfidenceScore;
}

export interface GraphPath {
  nodes: UUID[];
  edges: {
    sourceUUID: UUID;
    targetUUID: UUID;
    relationshipType: RelationshipType;
  }[];
  length: number;
  totalConfidence: ConfidenceScore;
}

// -- Timeline ----------------------------------------------------------------

export interface TimelineEvent {
  uuid: UUID;
  entityUUID: UUID;
  entityType: EntityType;
  eventType: EventType;
  title: string;
  description?: string;
  date: ISODateTime;
  datePrecision: "year" | "month" | "day" | "exact";
  confidence: ConfidenceScore;
  sources: SourceReference[];
}

// -- Evidence ----------------------------------------------------------------

export interface Evidence {
  uuid: UUID;
  claim: string;
  evidenceType: string;
  sourceUUID: UUID;
  sourceUrl: Url;
  excerpt?: string;
  personUUIDs: UUID[];
  labUUIDs: UUID[];
  paperDOIs: DOI[];
  confidence: ConfidenceScore;
  validated: boolean;
  validatorNotes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EvidenceReference {
  evidenceUUID: UUID;
  excerpt?: string;
  confidence: ConfidenceScore;
}

// ===========================================================================
// 5. Agent / pipeline events
// ===========================================================================

/** Base event all agent events extend. */
export interface AgentEvent {
  eventId: UUID;
  timestamp: ISODateTime;
  agentName: string;
  runId: UUID;
}

/** Emitted when a new source is discovered (crawler / listener). */
export interface DiscoveryEvent extends AgentEvent {
  eventType: "discovery";
  sourceUrl: Url;
  sourceType: string;
  title?: string;
  metadata: Record<string, unknown>;
}

/** Emitted during crawling — progress, retries, errors. */
export interface CrawlEvent extends AgentEvent {
  eventType: "crawl";
  sourceUUID: UUID;
  sourceUrl: Url;
  status: "started" | "in_progress" | "completed" | "failed";
  pagesProcessed?: number;
  errorMessage?: string;
  durationMs?: number;
}

/** Emitted when entities are extracted from crawled content. */
export interface ExtractionEvent extends AgentEvent {
  eventType: "extraction";
  sourceUUID: UUID;
  entitiesExtracted: {
    entityType: EntityType;
    count: number;
    uuids: UUID[];
  }[];
  rawTokens: number;
  promptVersion: string;
  modelUsed: string;
  durationMs: number;
}

/** Emitted when identity resolution runs (dedup / merge). */
export interface ResolutionEvent extends AgentEvent {
  eventType: "resolution";
  candidatesMatched: number;
  mergesPerformed: number;
  entitiesResolved: {
    keptUUID: UUID;
    mergedUUIDs: UUID[];
    entityType: EntityType;
    confidenceAfterMerge: ConfidenceScore;
  }[];
  durationMs: number;
}

/** Emitted when the knowledge graph is updated. */
export interface GraphEvent extends AgentEvent {
  eventType: "graph";
  operation: "node_added" | "edge_added" | "node_updated" | "edge_removed";
  nodeUUID?: UUID;
  nodeType?: EntityType;
  edgeSourceUUID?: UUID;
  edgeTargetUUID?: UUID;
  relationshipType?: RelationshipType;
  confidence?: ConfidenceScore;
}

/** Emitted when entity validation produces findings. */
export interface ValidationIssue {
  entityUUID: UUID;
  entityType: EntityType;
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}

// ===========================================================================
// 6. Pipeline job types (BullMQ job contracts)
// ===========================================================================

export type SourceType =
  | "lab-homepage"
  | "personal-homepage"
  | "arxiv"
  | "google-scholar"
  | "institutional"
  | "conference"
  | "journal"
  | "custom";

// -- Source Quality Tiers ----------------------------------------------------

/** 信源等级 — 信息源权威性分级 */
export type SourceTier = 'TIER_1_OFFICIAL' | 'TIER_2_ACADEMIC' | 'TIER_3_WEB' | 'TIER_4_OTHER';

/** 每条爬取信息的质量评分 */
export interface SourceQuality {
  tier: SourceTier;
  baseScore: number;        // 信源等级基础分 (100/80/60/40)
  freshnessScore: number;   // 时效性分 (0-1, 指数衰减)
  completenessScore: number; // 信息完整度 (0-1)
  crossSourceBonus: number;  // 多来源交叉验证加分
  totalScore: number;        // 加权总分
  scoredAt: string;          // ISO 评分时间
}

/** SourceTier → 默认爬取配置 */
export const TIER_DEFAULTS: Record<SourceTier, { priority: number; maxPagesPerSeed: number; depth: number }> = {
  TIER_1_OFFICIAL: { priority: 1, maxPagesPerSeed: 100, depth: 2 },
  TIER_2_ACADEMIC:  { priority: 3, maxPagesPerSeed: 50,  depth: 2 },
  TIER_3_WEB:       { priority: 5, maxPagesPerSeed: 30,  depth: 1 },
  TIER_4_OTHER:     { priority: 8, maxPagesPerSeed: 20,  depth: 1 },
};

// -- Crawl -------------------------------------------------------------------

export interface CrawlJob {
  seeds: string[];
  sourceType: SourceType;
  tier?: SourceTier;
  maxPagesPerSeed?: number;
  depth?: number;
}

export interface CrawledPage {
  url: string;
  title: string;
  textContent: string;
  /** Markdown 格式内容 (替代 raw innerText, 更利于 LLM 消费) */
  markdownContent?: string;
  contentType: string;
  crawledAt: string;
  /** HTTP Last-Modified header */
  lastModified?: string;
  /** 页面内容中检测到的日期 */
  pageDate?: string;
  links: string[];
  /** 页面类型: faculty-directory | lab-homepage | paper-abstract | personal-profile | generic */
  pageType?: string;
  sourceQuality?: SourceQuality;
  metadata: Record<string, unknown>;
  rawBuffer?: string; // base64 for PDFs
}

export interface CrawlResult {
  jobId: string;
  sourceType: SourceType;
  seeds: string[];
  pagesCrawled: number;
  durationMs: number;
  status: "completed" | "failed";
  completedAt: string;
  error?: string;
}

// -- Parse -------------------------------------------------------------------

export interface ParseJob {
  pages: CrawledPage[];
}

export interface ParsedPage {
  url: string;
  textContent: string;
  metadata?: Record<string, unknown>;
}

// -- Extract -----------------------------------------------------------------

export interface ExtractJob {
  pages: ParsedPage[];
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  resolvedId?: string;
  description?: string;
  aliases?: string[];
  affiliations?: string[];
  email?: string;
  institution?: string;
  orcid?: string;
  url?: string;
  confidence?: number;
  sourceUrl?: string;
  extractedAt?: string;
}

export interface ExtractedRelationship {
  type: string;
  sourceEntityId: string;
  targetEntityId: string;
  confidence?: number;
  evidence?: string;
  sourceUrl?: string;
  description?: string;
  extractedAt?: string;
}

export interface ExtractionResult {
  pageUrl: string;
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  status: "completed" | "skipped" | "failed";
  reason?: string;
}

export interface SourceEvidence {
  confidence?: number;
  excerpt?: string;
  context?: string;
  position?: number;
}

// -- Resolve -----------------------------------------------------------------

export interface ResolveJob {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

// -- Graph Build -------------------------------------------------------------

export interface BuildGraphJob {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  timelineEvents: TimelineEventInput[];
  fullBuild?: boolean;
}

export interface TimelineEventInput {
  entityId: string;
  type: string;
  date: string;
  title?: string;
  description?: string;
  sourceUrl?: string;
  confidence?: number;
}

export interface GraphBuildResult {
  jobId: string;
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
  timelineEventsCreated: number;
  status: "completed" | "failed";
  completedAt: string;
  error?: string;
}

// -- Discovery ---------------------------------------------------------------

export interface DiscoveryJob {
  method: "citation-graph" | "web-search";
  sources: string[];
  queries?: string[];
  maxNewNodes: number;
  minConfidence: number;
}

// -- Validate ----------------------------------------------------------------

export interface ValidateJob {
  checks: string[];
  autoRepair: boolean;
  reportDestination?: string;
}

// -- Dead Letter -------------------------------------------------------------

export interface DeadLetterJob {
  originalJobId: string;
  originalQueue: string;
  originalData: unknown;
  error: string;
  stack?: string;
  failedAt: string;
  attemptsMade: number;
}

// -- Scheduler ---------------------------------------------------------------

export interface ScheduledTask {
  taskName: string;
  cron: string;
  handler: () => Promise<void>;
}

export interface TaskStatus {
  taskName: string;
  status: "completed" | "failed" | "running";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// -- Worker ------------------------------------------------------------------

export interface JobResult {
  jobId: string;
  type: string;
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
}
