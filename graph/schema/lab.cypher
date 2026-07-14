// =============================================================================
// Lab Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The Lab node represents a research laboratory or group. Labs are typically
// part of a University through the BELONGS_TO relationship and house Equipment
// through the HAS_EQUIPMENT relationship.
// =============================================================================

// --- Uniqueness constraint on UUID ---
CREATE CONSTRAINT lab_uuid_unique IF NOT EXISTS
FOR (l:Lab) REQUIRE l.uuid IS UNIQUE;

// --- Node key constraint ---
CREATE CONSTRAINT lab_uuid_key IF NOT EXISTS
FOR (l:Lab) REQUIRE (l.uuid) IS NODE KEY;

// --- Index on lab name for lookup ---
CREATE INDEX lab_name_idx IF NOT EXISTS
FOR (l:Lab) ON (l.name);

// --- Index on English name ---
CREATE INDEX lab_english_name_idx IF NOT EXISTS
FOR (l:Lab) ON (l.englishName);

// --- Index on abbreviation (e.g., "QLAB", "SSRL") ---
CREATE INDEX lab_abbreviation_idx IF NOT EXISTS
FOR (l:Lab) ON (l.abbreviation);

// --- Index on country for geographic filtering ---
CREATE INDEX lab_country_idx IF NOT EXISTS
FOR (l:Lab) ON (l.country);

// --- Index on city ---
CREATE INDEX lab_city_idx IF NOT EXISTS
FOR (l:Lab) ON (l.city);

// --- Index on current status ---
CREATE INDEX lab_status_idx IF NOT EXISTS
FOR (l:Lab) ON (l.currentStatus);

// --- Composite geo index ---
CREATE INDEX lab_country_city_idx IF NOT EXISTS
FOR (l:Lab) ON (l.country, l.city);

// --- Full-text search index ---
CREATE FULLTEXT INDEX lab_fulltext IF NOT EXISTS
FOR (l:Lab)
ON EACH [l.name, l.englishName, l.description, l.keywords]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// --- Index on foundedYear for historical queries ---
CREATE INDEX lab_founded_year_idx IF NOT EXISTS
FOR (l:Lab) ON (l.foundedYear);

// =============================================================================
// Property Reference:
//   uuid          : String   — Unique identifier
//   name          : String   — Primary lab name (native language)
//   englishName   : String   — English name of the lab
//   abbreviation  : String   — Common abbreviation (e.g., "ALS", "SSRL")
//   homepage      : String   — Lab website URL
//   description   : String   — Detailed description of lab focus and capabilities
//   foundedYear   : Integer  — Year the lab was established
//   currentStatus : String   — 'active' | 'inactive' | 'merged' | 'closed'
//   keywords      : [String] — Research keywords / tags
//   equipmentList : [String] — Summary list of notable equipment names (detailed
//                              equipment linked via HAS_EQUIPMENT relationship)
//   country       : String   — ISO country code or full name
//   city          : String   — City name
//   latitude      : Float    — Geographic latitude
//   longitude     : Float    — Geographic longitude
//   createdAt     : DateTime — ISO 8601 record creation timestamp
//   updatedAt     : DateTime — ISO 8601 record update timestamp
//   lastVerified  : DateTime — ISO 8601 last verification timestamp
// =============================================================================
