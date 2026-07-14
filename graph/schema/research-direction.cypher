// =============================================================================
// ResearchDirection Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The ResearchDirection node represents a specific area of scientific inquiry.
// Directions form a taxonomy tree via PARENT_OF / CHILD_OF relationships and
// are linked to Persons (RESEARCHES_ON) and Papers (ABOUT).
// =============================================================================

// --- Uniqueness constraint on UUID ---
CREATE CONSTRAINT research_direction_uuid_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE rd.uuid IS UNIQUE;

// --- Node key constraint ---
CREATE CONSTRAINT research_direction_uuid_key IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.uuid) IS NODE KEY;

// --- Uniqueness constraint on (name, level) ---
// Name alone is not globally unique; composite with level provides uniqueness.
CREATE CONSTRAINT research_direction_name_level_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.name, rd.level) IS UNIQUE;

// --- Index on name ---
CREATE INDEX research_direction_name_idx IF NOT EXISTS
FOR (rd:ResearchDirection) ON (rd.name);

// --- Index on level for tree traversal ---
CREATE INDEX research_direction_level_idx IF NOT EXISTS
FOR (rd:ResearchDirection) ON (rd.level);

// --- Index on (level, name) for ordered lookup ---
CREATE INDEX research_direction_level_name_idx IF NOT EXISTS
FOR (rd:ResearchDirection) ON (rd.level, rd.name);

// --- Full-text search index ---
CREATE FULLTEXT INDEX research_direction_fulltext IF NOT EXISTS
FOR (rd:ResearchDirection)
ON EACH [rd.name, rd.description, rd.aliases]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// =============================================================================
// Property Reference:
//   uuid        : String   — Unique identifier
//   name        : String   — Direction name (e.g., "Topological Insulators")
//   level       : Integer  — Depth in taxonomy tree (0=root, 1=domain, 2=subdomain, ...)
//   description : String   — Detailed description of the research area
//   aliases     : [String] — Alternative names and abbreviations
//   createdAt   : DateTime — ISO 8601 record creation timestamp
//   updatedAt   : DateTime — ISO 8601 record update timestamp
//
// Example taxonomy levels:
//   Level 0: Root (Condensed Matter Physics)
//   Level 1: Domain (Quantum Materials, Topological Physics, ...)
//   Level 2: Subdomain (Topological Insulators, Weyl Semimetals, ...)
//   Level 3: Specific topic (Surface States, Spin Texture, ...)
// =============================================================================
