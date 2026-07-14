// =============================================================================
// Person Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The Person node represents an individual researcher in the ARPES community.
// It is the central entity linking labs, papers, equipment, and research directions.
// =============================================================================

// --- Uniqueness constraint on UUID (primary key) ---
CREATE CONSTRAINT person_uuid_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.uuid IS UNIQUE;

// --- Composite node key: uuid is the sole business identifier ---
// (Neo4j 5.x+ syntax; for 4.x use CREATE CONSTRAINT ON instead)
CREATE CONSTRAINT person_uuid_key IF NOT EXISTS
FOR (p:Person) REQUIRE (p.uuid) IS NODE KEY;

// --- Index for fast lookups by Chinese name ---
CREATE INDEX person_chinese_name_idx IF NOT EXISTS
FOR (p:Person) ON (p.chineseName);

// --- Index for fast lookups by English name ---
CREATE INDEX person_english_name_idx IF NOT EXISTS
FOR (p:Person) ON (p.englishName);

// --- Index on ORCID for identifier resolution ---
CREATE INDEX person_orcid_idx IF NOT EXISTS
FOR (p:Person) ON (p.orcid);

// --- Index on Google Scholar ID ---
CREATE INDEX person_google_scholar_idx IF NOT EXISTS
FOR (p:Person) ON (p.googleScholar);

// --- Index on email for deduplication ---
CREATE INDEX person_email_idx IF NOT EXISTS
FOR (p:Person) ON (p.email);

// --- Index on current status for filtering active/inactive researchers ---
CREATE INDEX person_status_idx IF NOT EXISTS
FOR (p:Person) ON (p.currentStatus);

// --- Composite index for common query pattern: name + status ---
CREATE INDEX person_name_status_idx IF NOT EXISTS
FOR (p:Person) ON (p.englishName, p.currentStatus);

// --- Full-text search index on names, biography, and research interests ---
// Supports fuzzy name matching and keyword discovery across the researcher corpus.
CREATE FULLTEXT INDEX person_fulltext IF NOT EXISTS
FOR (p:Person)
ON EACH [p.chineseName, p.englishName, p.biography, p.researchInterests]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// --- Index on createdAt for time-range queries ---
CREATE INDEX person_created_at_idx IF NOT EXISTS
FOR (p:Person) ON (p.createdAt);

// --- Index on lastVerified for staleness detection ---
CREATE INDEX person_last_verified_idx IF NOT EXISTS
FOR (p:Person) ON (p.lastVerified);

// =============================================================================
// Property Reference:
//   uuid              : String   — Unique identifier (ULID or UUID v7)
//   chineseName       : String   — Name in Chinese characters
//   englishName       : String   — Name in English / pinyin
//   aliases           : [String] — Alternative names, previous names, abbreviations
//   gender            : String   — 'male' | 'female' | 'other' | null
//   orcid             : String   — ORCID identifier (e.g., 0000-0002-1825-0097)
//   googleScholar     : String   — Google Scholar profile ID
//   researchGate      : String   — ResearchGate profile slug/ID
//   homepage          : String   — Personal or institutional homepage URL
//   email             : String   — Primary institutional email
//   avatar            : String   — URL to profile photo
//   biography         : String   — Free-text biographical summary
//   researchInterests : [String] — List of research interest keywords
//   currentStatus     : String   — 'active' | 'emeritus' | 'deceased' | 'industry' | 'unknown'
//   confidence        : Float    — 0.0–1.0 score indicating data quality/verification level
//   createdAt         : DateTime — ISO 8601 timestamp of record creation
//   updatedAt         : DateTime — ISO 8601 timestamp of last update
//   lastVerified      : DateTime — ISO 8601 timestamp of last manual/AI verification
// =============================================================================
