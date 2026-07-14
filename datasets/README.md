# ARP Seed Data

This directory contains seed datasets for bootstrapping the Targon Nexus (Targon Nexus) knowledge graph. The data covers the global ARPES (Angle-Resolved Photoemission Spectroscopy) research community.

## Data Files

| File | Description | Record Count |
|------|-------------|-------------|
| `universities/seed.csv` | Research institutions and universities | ~50 |
| `labs/seed.csv` | ARPES research laboratories and groups | ~36 |
| `professors/seed.csv` | ARPES research professors and PIs | ~50 |
| `papers/seed.csv` | Landmark ARPES publications | ~31 |
| `companies/seed.csv` | Industry destinations for ARPES alumni | ~11 |
| `taxonomy/arpes-directions.csv` | ARPES research direction taxonomy (3 levels) | ~24 |
| `synchrotrons/seed.csv` | Global synchrotron radiation facilities | ~30 |
| `equipment/seed.csv` | ARPES and related scientific equipment | ~35 |

## UUID Conventions

All UUIDs in seed data **must** be real RFC 4122 UUIDs. We use **UUIDv5** for deterministic generation where practical:

```
UUIDv5(namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8", name = entity identifier)
```

For entities without obvious stable identifiers, use randomly generated UUIDv4.

### Reserved UUID Ranges (for this seed set)

| Range Prefix | Entity Type |
|-------------|-------------|
| `550e8400-*-*-*-*` | Universities |
| `660e8400-*-*-*-*` | Labs |
| `770e8400-*-*-*-*` | Professors |
| `880e8400-*-*-*-*` | Companies |
| `990e8400-0001-*` | Taxonomy Level 1 |
| `990e8400-0002-*` | Taxonomy Level 2 |
| `990e8400-0003-*` | Taxonomy Level 3 |

## Import Instructions

### Neo4j (Knowledge Graph - Professors, Labs, Universities, Papers)

```cypher
// Load universities
LOAD CSV WITH HEADERS FROM 'file:///universities/seed.csv' AS row
CREATE (u:University {
  uuid: row.uuid,
  chineseName: row.chineseName,
  englishName: row.englishName,
  country: row.country,
  city: row.city,
  website: row.website,
  description: row.description
});

// Load professors (with relationship to university)
LOAD CSV WITH HEADERS FROM 'file:///professors/seed.csv' AS row
MATCH (uni:University {uuid: row.universityUuid})
CREATE (p:Professor {
  uuid: row.uuid,
  chineseName: row.chineseName,
  englishName: row.englishName,
  orcid: row.orcid,
  homepage: row.homepage,
  email: row.email,
  researchInterests: row.researchInterests
})
CREATE (p)-[:AFFILIATED_WITH]->(uni);

// Load labs
LOAD CSV WITH HEADERS FROM 'file:///labs/seed.csv' AS row
MATCH (uni:University {uuid: row.universityUuid})
CREATE (l:Lab {
  uuid: row.uuid,
  name: row.name,
  englishName: row.englishName,
  abbreviation: row.abbreviation,
  homepage: row.homepage,
  description: row.description,
  foundedYear: toInteger(row.foundedYear),
  country: row.country,
  city: row.city,
  keywords: row.keywords
})
CREATE (l)-[:BELONGS_TO]->(uni);

// Load taxonomy
LOAD CSV WITH HEADERS FROM 'file:///taxonomy/arpes-directions.csv' AS row
CREATE (t:ResearchDirection {
  uuid: row.uuid,
  name: row.name,
  level: toInteger(row.level),
  description: row.description
});

// Create parent-child relationships for taxonomy
LOAD CSV WITH HEADERS FROM 'file:///taxonomy/arpes-directions.csv' AS row
WITH row WHERE row.parentUuid IS NOT NULL AND row.parentUuid <> ''
MATCH (child:ResearchDirection {uuid: row.uuid})
MATCH (parent:ResearchDirection {uuid: row.parentUuid})
CREATE (child)-[:CHILD_OF]->(parent);
```

### PostgreSQL (Relational Data - Publications, Metrics, User Data)

```sql
-- Create papers table
CREATE TABLE IF NOT EXISTS papers (
    doi VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT,
    year INTEGER,
    journal VARCHAR(255),
    citation_count INTEGER DEFAULT 0,
    keywords TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Import papers via COPY
\COPY papers(doi, title, authors, year, journal, citation_count, keywords)
FROM 'papers/seed.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ',');
```

### All-in-One Import Script

```bash
# Using docker exec for Neo4j
docker exec -i arp-neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD < import/neo4j-seed.cypher

# Using docker exec for PostgreSQL
docker exec -i arp-postgres psql -U postgres -d arp < import/postgres-seed.sql
```

## Data Quality Notes

1. **Emails**: Professor emails use `@placeholder.*` domain suffixes. Replace with real emails when available. The system should flag `@placeholder.*` addresses in the UI.

2. **ORCID iDs**: ORCID identifiers use the standard `0000-000X-XXXX-XXXX` format. Some may be illustrative; verify before using in production.

3. **Citation counts**: Paper citation counts are approximate as of mid-2024. The system should periodically refresh these via the crawler service.

4. **Person names**: Chinese names follow the convention `chineseName` (Chinese characters) and `englishName` (romanized form). The ordering in `englishName` follows Western convention (given name first) where available.

5. **Keywords**: Multi-valued fields (keywords, research interests) use semicolons (`;`) as delimiters. The import pipeline should tokenize these.

6. **Paper DOIs**: All paper DOIs should be valid and resolvable at `https://doi.org/`. The crawler service validates these during import.

7. **Taxonomy**: The three-level taxonomy is not exhaustive. It captures the main ARPES research directions but should be extended as the platform ingests more papers and researcher profiles.

## Encoding

All CSV files are UTF-8 encoded. Chinese characters are used natively (not escaped). CRLF line endings (Windows-style).
