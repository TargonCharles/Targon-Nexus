// =============================================================================
// Uniqueness Constraints & Node Key Constraints — All Entity Types
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// Each entity type has:
//   1. A UUID uniqueness constraint (mandatory primary key)
//   2. A UUID node key constraint (ensures UUID is always present and unique)
//   3. Entity-specific uniqueness constraints (e.g., DOI for Paper)
// =============================================================================

// =============================================================================
// Person Constraints
// =============================================================================

// UUID must be unique across all Person nodes
CREATE CONSTRAINT person_uuid_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.uuid IS UNIQUE;

// UUID serves as the node key: must exist and uniquely identify each Person
CREATE CONSTRAINT person_uuid_key IF NOT EXISTS
FOR (p:Person) REQUIRE (p.uuid) IS NODE KEY;

// =============================================================================
// Lab Constraints
// =============================================================================

CREATE CONSTRAINT lab_uuid_unique IF NOT EXISTS
FOR (l:Lab) REQUIRE l.uuid IS UNIQUE;

CREATE CONSTRAINT lab_uuid_key IF NOT EXISTS
FOR (l:Lab) REQUIRE (l.uuid) IS NODE KEY;

// =============================================================================
// University Constraints
// =============================================================================

CREATE CONSTRAINT university_uuid_unique IF NOT EXISTS
FOR (u:University) REQUIRE u.uuid IS UNIQUE;

CREATE CONSTRAINT university_uuid_key IF NOT EXISTS
FOR (u:University) REQUIRE (u.uuid) IS NODE KEY;

// =============================================================================
// Equipment Constraints
// =============================================================================

CREATE CONSTRAINT equipment_uuid_unique IF NOT EXISTS
FOR (e:Equipment) REQUIRE e.uuid IS UNIQUE;

CREATE CONSTRAINT equipment_uuid_key IF NOT EXISTS
FOR (e:Equipment) REQUIRE (e.uuid) IS NODE KEY;

// =============================================================================
// Research Direction Constraints
// =============================================================================

CREATE CONSTRAINT research_direction_uuid_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE rd.uuid IS UNIQUE;

CREATE CONSTRAINT research_direction_uuid_key IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.uuid) IS NODE KEY;

// Composite uniqueness: no two directions at the same level can have the same name
CREATE CONSTRAINT research_direction_name_level_unique IF NOT EXISTS
FOR (rd:ResearchDirection) REQUIRE (rd.name, rd.level) IS UNIQUE;

// =============================================================================
// Paper Constraints
// =============================================================================

CREATE CONSTRAINT paper_uuid_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.uuid IS UNIQUE;

// DOI is the natural business key for papers — must be globally unique
// Papers without DOIs (e.g., arXiv preprints) should use a generated DOI-like identifier
CREATE CONSTRAINT paper_doi_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.doi IS UNIQUE;

CREATE CONSTRAINT paper_uuid_key IF NOT EXISTS
FOR (p:Paper) REQUIRE (p.uuid) IS NODE KEY;

// =============================================================================
// Relationship Property Existence Constraints (Neo4j 5.x+)
// =============================================================================
// Ensure critical relationship properties are always present.

// -- Example: enforce that COAUTHOR_WITH relationships always have a paperCount --
// CREATE CONSTRAINT coauthor_paper_count_exists IF NOT EXISTS
// FOR ()-[r:COAUTHOR_WITH]-() REQUIRE r.paperCount IS NOT NULL;
//
// Note: Relationship property existence constraints are optional and depend on
// the strictness requirements of your data model. Uncomment and customize as needed.

// =============================================================================
// Verification Queries
// =============================================================================

// -- List all constraints --
// SHOW CONSTRAINTS;

// -- List all constraints for a specific label --
// SHOW CONSTRAINTS WHERE entityType = 'NODE' AND labelsOrTypes = ['Person'];

// -- Drop a specific constraint --
// DROP CONSTRAINT person_uuid_unique IF EXISTS;

// -- Check for duplicate UUIDs (should return 0 rows if constraints are enforced) --
// MATCH (n) WITH n.uuid AS uid, collect(labels(n)) AS labels, count(*) AS cnt
// WHERE cnt > 1 RETURN uid, labels, cnt;

// -- Check for null UUIDs (should return 0 rows if node key constraints are enforced) --
// MATCH (n) WHERE n.uuid IS NULL RETURN labels(n), count(*);
