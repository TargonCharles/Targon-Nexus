// ---------------------------------------------------------------------------
// ARP Shared — barrel export
// ---------------------------------------------------------------------------
// Zero-dependency utility modules consumed across the Targon Nexus.
//
// Module summary:
//   uuid.ts       – v4 generation, validation, normalization
//   name.ts       – Chinese / English name normalization, pinyin conversion,
//                   alias matching, affiliation disambiguation helpers
//   date.ts       – ISO-8601 formatting, relative-time strings,
//                   date-range parsing, academic-year helpers
//   url.ts        – URL validation, normalization, robots.txt rule checking,
//                   DOI / ORCID / Google Scholar identifier extraction
//   confidence.ts – Confidence-score calculation (weighted-multi-evidence),
//                   threshold helpers, tier labelling (High / Medium / Low)
//   evidence.ts   – Evidence-record factory, validation, deduplication
// ---------------------------------------------------------------------------

// -- UUID --------------------------------------------------------------------

export {
  generateUUID,
  generateUUIDv4,
  isValidUUID,
  normalizeUUID,
  UUID_REGEX,
  UUID_PATTERN,
} from "./uuid";
export type { UUID, UUIDVersion } from "./uuid";

// -- Name normalization ---------------------------------------------------

export {
  normalizeChineseName,
  normalizeEnglishName,
  fullNameToParts,
  partsToFullName,
  normalizeName,
  normalizeNameForDedup,
  normalizeNameExact,
  normalizeNameUnicode,
  nameFingerprint,
  toPinyin,
  toPinyinArray,
  generateNameAliases,
  crossLanguageNameMatch,
  isCJKName,
  matchAlias,
  fuzzyMatchName,
  extractAffiliationTokens,
  normalizeInstitution,
  normalizeInstitutionName,
  NORMALIZATION_RULES,
} from "./name";
export type {
  NameParts,
  PinyinResult,
  AliasMatchResult,
  NormalizationOptions,
} from "./name";

// -- Date --------------------------------------------------------------------

export {
  toISO,
  toISODate,
  formatRelativeTime,
  parseFlexibleDate,
  isDateInRange,
  academicYear,
  academicYearRange,
  daysBetween,
  formatDateRange,
  parseDateRange,
} from "./date";
export type { FlexibleDateInput, DateRange, AcademicYear } from "./date";

// -- URL ---------------------------------------------------------------------

export {
  isValidURL,
  normalizeURL,
  extractDomain,
  isAllowedByRobotsRule,
  matchesRobotsRule,
  extractDOI,
  extractORCID,
  extractGoogleScholarId,
  isAcademicDomain,
  guessSourceType,
  URL_PATTERNS,
  ACADEMIC_DOMAINS,
} from "./url";
export type { URLValidationResult, SourceTypeGuess } from "./url";

// -- Confidence --------------------------------------------------------------

export {
  computeConfidence,
  combineConfidenceScores,
  isConfidenceAbove,
  confidenceTier,
  weightedAverage,
  bayesianUpdate,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  CONFIDENCE_TIERS,
} from "./confidence";
export type {
  ConfidenceInput,
  ConfidenceTier,
  ConfidenceThresholds,
} from "./confidence";

// -- Evidence ----------------------------------------------------------------

export {
  createEvidenceRecord,
  validateEvidence,
  deduplicateEvidence,
  mergeEvidenceRecords,
  evidenceSummary,
  isEvidenceSufficient,
  EVIDENCE_REQUIREMENTS,
} from "./evidence";
export type {
  EvidenceRecord,
  EvidenceType,
  EvidenceValidationResult,
  EvidenceMergeResult,
} from "./evidence";

// -- Logger ------------------------------------------------------------------

export { createLogger } from "./logger";
export type { Logger } from "./logger";

// -- ID generator ------------------------------------------------------------

export { generateId, generateRandomId } from "./id";

// -- Pagination helper -------------------------------------------------------

export { paginate } from "./pagination";
export type { PaginationOpts, PaginationResult } from "./pagination";

// -- JSON extraction helper --------------------------------------------------

export { extractJsonArray } from "./json";

// -- Graph utilities --------------------------------------------------------

export { buildGraphFromRows, parseArrayProperty, getDisplayName } from "./graph";
export type { GraphNode, GraphEdge, GraphData } from "./graph";

// -- Redis ------------------------------------------------------------------

export { createRedisConnection } from "./redis";
export type { RedisConnectionOptions } from "./redis";

// -- Service bootstrap ------------------------------------------------------

export { runService } from "./bootstrap";
export type { ServiceConfig } from "./bootstrap";

// -- Telemetry --------------------------------------------------------------

export { initTelemetry, createTracer, createCounter, logWithTrace } from "./telemetry";
export type { TelemetryConfig, Span } from "./telemetry";
