// =============================================================================
// Equipment Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The Equipment node represents a scientific instrument or apparatus.
// Equipment belongs to Labs (HAS_EQUIPMENT) and is used by Persons (USED_BY)
// for specific ResearchDirections (USED_FOR).
// =============================================================================

// --- Uniqueness constraint on UUID ---
CREATE CONSTRAINT equipment_uuid_unique IF NOT EXISTS
FOR (e:Equipment) REQUIRE e.uuid IS UNIQUE;

// --- Node key constraint ---
CREATE CONSTRAINT equipment_uuid_key IF NOT EXISTS
FOR (e:Equipment) REQUIRE (e.uuid) IS NODE KEY;

// --- Index on equipment name ---
CREATE INDEX equipment_name_idx IF NOT EXISTS
FOR (e:Equipment) ON (e.name);

// --- Index on brand ---
CREATE INDEX equipment_brand_idx IF NOT EXISTS
FOR (e:Equipment) ON (e.brand);

// --- Index on manufacturer ---
CREATE INDEX equipment_manufacturer_idx IF NOT EXISTS
FOR (e:Equipment) ON (e.manufacturer);

// --- Index on category for classification filtering ---
CREATE INDEX equipment_category_idx IF NOT EXISTS
FOR (e:Equipment) ON (e.category);

// --- Composite index: brand + model ---
CREATE INDEX equipment_brand_model_idx IF NOT EXISTS
FOR (e:Equipment) ON (e.brand, e.model);

// --- Full-text search index ---
CREATE FULLTEXT INDEX equipment_fulltext IF NOT EXISTS
FOR (e:Equipment)
ON EACH [e.name, e.description, e.keywords, e.brand, e.model]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// =============================================================================
// Property Reference:
//   uuid         : String   — Unique identifier
//   name         : String   — Primary equipment name (e.g., "DA30 ARPES")
//   brand        : String   — Brand name (e.g., "Scienta Omicron")
//   manufacturer : String   — Legal manufacturer name
//   model        : String   — Model number or name (e.g., "DA30-L")
//   generation   : String   — Generation/variant (e.g., "Gen 2", "R4000")
//   description  : String   — Detailed description of capabilities
//   category     : String   — Equipment category (e.g., "ARPES", "MBE", "STM")
//   keywords     : [String] — Searchable keywords for discovery
//   createdAt    : DateTime — ISO 8601 record creation timestamp
//   updatedAt    : DateTime — ISO 8601 record update timestamp
// =============================================================================
