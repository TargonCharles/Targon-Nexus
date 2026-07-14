// =============================================================================
// Paper Node Schema — Constraints & Indexes
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// The Paper node represents a scholarly publication. Papers are linked to
// Persons via AUTHORED_BY, to Journals/Conferences via PUBLISHED_IN, to
// ResearchDirections via ABOUT, and to other Papers via CITES.
// =============================================================================

// --- Uniqueness constraint on UUID ---
CREATE CONSTRAINT paper_uuid_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.uuid IS UNIQUE;

// --- DOI is the natural unique business key for papers ---
CREATE CONSTRAINT paper_doi_unique IF NOT EXISTS
FOR (p:Paper) REQUIRE p.doi IS UNIQUE;

// --- Node key on UUID ---
CREATE CONSTRAINT paper_uuid_key IF NOT EXISTS
FOR (p:Paper) REQUIRE (p.uuid) IS NODE KEY;

// --- Index on title for lookup ---
CREATE INDEX paper_title_idx IF NOT EXISTS
FOR (p:Paper) ON (p.title);

// --- Index on journal ---
CREATE INDEX paper_journal_idx IF NOT EXISTS
FOR (p:Paper) ON (p.journal);

// --- Index on conference ---
CREATE INDEX paper_conference_idx IF NOT EXISTS
FOR (p:Paper) ON (p.conference);

// --- Index on year for time-range queries ---
CREATE INDEX paper_year_idx IF NOT EXISTS
FOR (p:Paper) ON (p.year);

// --- Index on citation count for ranking ---
CREATE INDEX paper_citation_count_idx IF NOT EXISTS
FOR (p:Paper) ON (p.citationCount);

// --- Index on source for provenance tracking ---
CREATE INDEX paper_source_idx IF NOT EXISTS
FOR (p:Paper) ON (p.source);

// --- Composite index: year + citationCount for top-papers-by-year ---
CREATE INDEX paper_year_citations_idx IF NOT EXISTS
FOR (p:Paper) ON (p.year, p.citationCount);

// --- Full-text search index ---
CREATE FULLTEXT INDEX paper_fulltext IF NOT EXISTS
FOR (p:Paper)
ON EACH [p.title, p.keywords]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// =============================================================================
// Property Reference:
//   uuid          : String   — Unique identifier
//   doi           : String   — Digital Object Identifier (unique, e.g., "10.1038/nature12345")
//   title         : String   — Full paper title
//   authors       : [String] — Ordered list of author names as they appear
//   journal       : String   — Journal name (e.g., "Nature Physics")
//   conference    : String   — Conference name (for proceedings)
//   year          : Integer  — Publication year
//   citationCount : Integer  — Number of citations (from Semantic Scholar / CrossRef)
//   keywords      : [String] — Author or auto-extracted keywords
//   url           : String   — URL to paper landing page or PDF
//   source        : String   — Data source (e.g., 'semantic_scholar', 'crossref', 'arxiv')
//   createdAt     : DateTime — ISO 8601 record creation timestamp
//   updatedAt     : DateTime — ISO 8601 record update timestamp
// =============================================================================
