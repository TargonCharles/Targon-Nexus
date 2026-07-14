// =============================================================================
// Full-Text Search Indexes — All Entity Types
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// Full-text indexes power the search experience across all entity types.
// They use Lucene's standard analyzer for tokenization, stemming, and
// stop-word removal. The eventually_consistent option improves write
// performance at the cost of near-real-time search consistency.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Person Full-Text Index — Names, biography, research interests
// ---------------------------------------------------------------------------
// Searched properties: chineseName, englishName, biography, researchInterests
// Use case: Find researchers by name (including partial), research area,
//           or keywords in their biographical description.
// Query: CALL db.index.fulltext.queryNodes('person_fulltext', 'topological insulator OR quantum materials')
CREATE FULLTEXT INDEX person_fulltext IF NOT EXISTS
FOR (p:Person)
ON EACH [p.chineseName, p.englishName, p.biography, p.researchInterests]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// ---------------------------------------------------------------------------
// 2. Lab Full-Text Index — Name, description, keywords
// ---------------------------------------------------------------------------
// Searched properties: name, englishName, description, keywords
// Use case: Find labs by name, research focus, or capability keywords.
// Query: CALL db.index.fulltext.queryNodes('lab_fulltext', 'angle resolved photoemission')
CREATE FULLTEXT INDEX lab_fulltext IF NOT EXISTS
FOR (l:Lab)
ON EACH [l.name, l.englishName, l.description, l.keywords]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// ---------------------------------------------------------------------------
// 3. University Full-Text Index — Names, description
// ---------------------------------------------------------------------------
// Searched properties: chineseName, englishName, description
// Use case: Find universities by name in either language or descriptive text.
// Query: CALL db.index.fulltext.queryNodes('university_fulltext', 'Tsinghua OR Peking')
CREATE FULLTEXT INDEX university_fulltext IF NOT EXISTS
FOR (u:University)
ON EACH [u.chineseName, u.englishName, u.description]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// ---------------------------------------------------------------------------
// 4. Equipment Full-Text Index — Name, description, keywords, brand, model
// ---------------------------------------------------------------------------
// Searched properties: name, description, keywords, brand, model
// Use case: Find equipment by name, brand, model number, or capability description.
// Query: CALL db.index.fulltext.queryNodes('equipment_fulltext', 'Scienta DA30 hemispherical analyzer')
CREATE FULLTEXT INDEX equipment_fulltext IF NOT EXISTS
FOR (e:Equipment)
ON EACH [e.name, e.description, e.keywords, e.brand, e.model]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// ---------------------------------------------------------------------------
// 5. Research Direction Full-Text Index — Name, description, aliases
// ---------------------------------------------------------------------------
// Searched properties: name, description, aliases
// Use case: Find research directions by name, alias, or descriptive text.
// Query: CALL db.index.fulltext.queryNodes('research_direction_fulltext', 'strongly correlated electron systems')
CREATE FULLTEXT INDEX research_direction_fulltext IF NOT EXISTS
FOR (rd:ResearchDirection)
ON EACH [rd.name, rd.description, rd.aliases]
OPTIONS {
    indexConfig: {
        `fulltext.analyzer`: 'standard',
        `fulltext.eventually_consistent`: true
    }
};

// ---------------------------------------------------------------------------
// 6. Paper Full-Text Index — Title, keywords
// ---------------------------------------------------------------------------
// Searched properties: title, keywords
// Use case: Find papers by title keywords or subject keywords.
// Query: CALL db.index.fulltext.queryNodes('paper_fulltext', 'Fermi surface nesting charge density wave')
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
// Usage Examples — Full-Text Query Reference
// =============================================================================

// -- Simple term search --
// CALL db.index.fulltext.queryNodes('person_fulltext', 'Ding') YIELD node, score RETURN node.englishName, score;

// -- Boolean operators --
// CALL db.index.fulltext.queryNodes('paper_fulltext', 'ARPES AND topological') YIELD node, score RETURN node.title, score;

// -- Fuzzy search (append ~) --
// CALL db.index.fulltext.queryNodes('person_fulltext', 'Shen~') YIELD node, score WHERE score > 0.5 RETURN node.englishName, score;

// -- Phrase search --
// CALL db.index.fulltext.queryNodes('paper_fulltext', '"angle-resolved photoemission"') YIELD node, score RETURN node.title, score;

// -- Wildcard --
// CALL db.index.fulltext.queryNodes('equipment_fulltext', 'Scienta*') YIELD node, score RETURN node.name, node.model, score;

// -- Proximity search (Neo4j 5.x+) --
// CALL db.index.fulltext.queryNodes('paper_fulltext', 'topological NEAR insulator') YIELD node, score RETURN node.title, score;

// =============================================================================
// Index Management Commands
// =============================================================================

// -- List all full-text indexes --
// SHOW FULLTEXT INDEXES;

// -- Drop a specific full-text index --
// DROP FULLTEXT INDEX person_fulltext IF EXISTS;

// -- Rebuild (if eventually_consistent, triggers a full rebuild) --
// Nothing needed; indexes are automatically maintained by Neo4j.
// For manual refresh after bulk load, run a dummy query to warm the index:
// CALL db.index.fulltext.queryNodes('person_fulltext', '*') YIELD node RETURN count(node);
