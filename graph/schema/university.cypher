// =============================================================================
// University Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The University node represents a higher-education or research institution.
// Universities serve as the top-level organizational container, linked to Labs
// via HAS_LAB and to Persons via AFFILIATED_WITH.
// =============================================================================

// --- Uniqueness constraint on UUID ---
CREATE CONSTRAINT university_uuid_unique IF NOT EXISTS
FOR (u:University) REQUIRE u.uuid IS UNIQUE;

// --- Node key constraint ---
CREATE CONSTRAINT university_uuid_key IF NOT EXISTS
FOR (u:University) REQUIRE (u.uuid) IS NODE KEY;

// --- Index on Chinese name ---
CREATE INDEX university_chinese_name_idx IF NOT EXISTS
FOR (u:University) ON (u.chineseName);

// --- Index on English name ---
CREATE INDEX university_english_name_idx IF NOT EXISTS
FOR (u:University) ON (u.englishName);

// --- Index on country ---
CREATE INDEX university_country_idx IF NOT EXISTS
FOR (u:University) ON (u.country);

// --- Index on city ---
CREATE INDEX university_city_idx IF NOT EXISTS
FOR (u:University) ON (u.city);

// --- Composite geo index ---
CREATE INDEX university_country_city_idx IF NOT EXISTS
FOR (u:University) ON (u.country, u.city);

// --- Full-text search index on names and description ---
CREATE FULLTEXT INDEX university_fulltext IF NOT EXISTS
FOR (u:University)
ON EACH [u.chineseName, u.englishName, u.description]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// =============================================================================
// Property Reference:
//   uuid        : String   — Unique identifier
//   chineseName : String   — Institution name in Chinese
//   englishName : String   — Institution name in English
//   country     : String   — ISO country code or full country name
//   city        : String   — City where the main campus is located
//   website     : String   — Official institution homepage URL
//   logo        : String   — URL to institution logo/badge
//   description : String   — Brief description of the institution
//   createdAt   : DateTime — ISO 8601 record creation timestamp
//   updatedAt   : DateTime — ISO 8601 record update timestamp
// =============================================================================
