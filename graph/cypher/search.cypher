// =============================================================================
// Search Queries — Entity Search & Discovery
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// Parameter convention: $paramName for user-supplied values.
// All queries include SKIP/LIMIT for pagination, defaulting to LIMIT 20.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. searchPersonByName — Exact and fuzzy name matching for researchers
// ---------------------------------------------------------------------------
// Params: $query (String), $status (String|null), $skip (Int), $limit (Int)
MATCH (p:Person)
WHERE
    p.englishName CONTAINS $query
    OR p.chineseName CONTAINS $query
    OR ANY(alias IN p.aliases WHERE alias CONTAINS $query)
WITH p
WHERE $status IS NULL OR p.currentStatus = $status
RETURN p.uuid         AS uuid,
       p.englishName  AS name,
       p.chineseName  AS chineseName,
       p.currentStatus AS status,
       p.researchInterests AS interests,
       p.orcid        AS orcid
ORDER BY p.englishName
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 2. searchLabByName — Find labs by name, abbreviation, or keywords
// ---------------------------------------------------------------------------
// Params: $query (String), $country (String|null), $skip (Int), $limit (Int)
MATCH (l:Lab)
WHERE
    l.name CONTAINS $query
    OR l.englishName CONTAINS $query
    OR l.abbreviation CONTAINS $query
    OR ANY(kw IN l.keywords WHERE kw CONTAINS $query)
WITH l
WHERE $country IS NULL OR l.country = $country
OPTIONAL MATCH (l)-[:BELONGS_TO]->(u:University)
RETURN l.uuid          AS uuid,
       l.name          AS name,
       l.englishName   AS englishName,
       l.abbreviation  AS abbreviation,
       l.country       AS country,
       l.city          AS city,
       u.englishName   AS university,
       l.currentStatus AS status
ORDER BY l.name
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 3. searchUniversityByName — Find universities/institutions
// ---------------------------------------------------------------------------
// Params: $query (String), $country (String|null), $skip (Int), $limit (Int)
MATCH (u:University)
WHERE
    u.chineseName CONTAINS $query
    OR u.englishName CONTAINS $query
WITH u
WHERE $country IS NULL OR u.country = $country
RETURN u.uuid        AS uuid,
       u.englishName AS name,
       u.chineseName AS chineseName,
       u.country     AS country,
       u.city        AS city,
       u.website     AS website
ORDER BY u.englishName
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 4. searchEquipmentByName — Find equipment by name, brand, or model
// ---------------------------------------------------------------------------
// Params: $query (String), $category (String|null), $skip (Int), $limit (Int)
MATCH (e:Equipment)
WHERE
    e.name CONTAINS $query
    OR e.brand CONTAINS $query
    OR e.model CONTAINS $query
    OR ANY(kw IN e.keywords WHERE kw CONTAINS $query)
WITH e
WHERE $category IS NULL OR e.category = $category
OPTIONAL MATCH (l:Lab)-[:HAS_EQUIPMENT]->(e)
RETURN e.uuid         AS uuid,
       e.name         AS name,
       e.brand        AS brand,
       e.model        AS model,
       e.category     AS category,
       collect(l.name) AS labs
ORDER BY e.name
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 5. searchResearchDirection — Find research directions by name or alias
// ---------------------------------------------------------------------------
// Params: $query (String), $level (Int|null), $skip (Int), $limit (Int)
MATCH (rd:ResearchDirection)
WHERE
    rd.name CONTAINS $query
    OR ANY(alias IN rd.aliases WHERE alias CONTAINS $query)
WITH rd
WHERE $level IS NULL OR rd.level = $level
OPTIONAL MATCH (parent:ResearchDirection)-[:PARENT_OF]->(rd)
OPTIONAL MATCH (rd)-[:PARENT_OF]->(child:ResearchDirection)
RETURN rd.uuid        AS uuid,
       rd.name        AS name,
       rd.level       AS level,
       parent.name    AS parent,
       collect(child.name) AS children,
       rd.description AS description
ORDER BY rd.level, rd.name
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 6. searchPaper — Find papers by title, DOI, keywords, or author
// ---------------------------------------------------------------------------
// Params: $query (String), $yearMin (Int|null), $yearMax (Int|null), $skip (Int), $limit (Int)
MATCH (p:Paper)
WHERE
    p.title CONTAINS $query
    OR p.doi = $query
    OR ANY(kw IN p.keywords WHERE kw CONTAINS $query)
    OR ANY(author IN p.authors WHERE author CONTAINS $query)
WITH p
WHERE
    ($yearMin IS NULL OR p.year >= $yearMin)
    AND ($yearMax IS NULL OR p.year <= $yearMax)
RETURN p.uuid          AS uuid,
       p.doi           AS doi,
       p.title         AS title,
       p.journal       AS journal,
       p.year          AS year,
       p.citationCount AS citations,
       p.authors[..5]  AS firstAuthors
ORDER BY p.citationCount DESC
SKIP coalesce($skip, 0)
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 7. globalSearch — Search across all entity types simultaneously
// ---------------------------------------------------------------------------
// Params: $query (String), $entityTypes ([String]|null), $limit (Int)
// Returns top matches from each entity type, deduplicated.
CALL {
    // Search Persons
    MATCH (p:Person)
    WHERE
        p.englishName CONTAINS $query
        OR p.chineseName CONTAINS $query
        OR ANY(alias IN p.aliases WHERE alias CONTAINS $query)
    RETURN p.uuid AS id, p.englishName AS label, 'Person' AS entityType, p.currentStatus AS subtitle
    LIMIT coalesce($limit, 10)
  UNION ALL
    // Search Labs
    MATCH (l:Lab)
    WHERE
        l.name CONTAINS $query
        OR l.englishName CONTAINS $query
        OR l.abbreviation CONTAINS $query
    RETURN l.uuid AS id, l.name AS label, 'Lab' AS entityType, l.country AS subtitle
    LIMIT coalesce($limit, 10)
  UNION ALL
    // Search Universities
    MATCH (u:University)
    WHERE
        u.englishName CONTAINS $query
        OR u.chineseName CONTAINS $query
    RETURN u.uuid AS id, u.englishName AS label, 'University' AS entityType, u.country AS subtitle
    LIMIT coalesce($limit, 10)
  UNION ALL
    // Search Equipment
    MATCH (e:Equipment)
    WHERE
        e.name CONTAINS $query
        OR e.brand CONTAINS $query
        OR e.model CONTAINS $query
    RETURN e.uuid AS id, e.name AS label, 'Equipment' AS entityType, e.category AS subtitle
    LIMIT coalesce($limit, 10)
  UNION ALL
    // Search Research Directions
    MATCH (rd:ResearchDirection)
    WHERE
        rd.name CONTAINS $query
        OR ANY(alias IN rd.aliases WHERE alias CONTAINS $query)
    RETURN rd.uuid AS id, rd.name AS label, 'ResearchDirection' AS entityType, toString(rd.level) AS subtitle
    LIMIT coalesce($limit, 10)
  UNION ALL
    // Search Papers
    MATCH (p:Paper)
    WHERE
        p.title CONTAINS $query
        OR ANY(kw IN p.keywords WHERE kw CONTAINS $query)
    RETURN p.uuid AS id, p.title AS label, 'Paper' AS entityType, toString(p.year) AS subtitle
    LIMIT coalesce($limit, 10)
}
WHERE $entityTypes IS NULL OR entityType IN $entityTypes
RETURN id, label, entityType, subtitle
LIMIT coalesce($limit, 30);

// ---------------------------------------------------------------------------
// 8. fuzzySearch — Fuzzy name matching across Persons using full-text index
// ---------------------------------------------------------------------------
// Params: $query (String), $fuzziness (String|null = 'AUTO'), $limit (Int)
// Uses the full-text index for Lucene-based fuzzy matching.
CALL db.index.fulltext.queryNodes('person_fulltext', $query + '~')
YIELD node AS p, score
WHERE score > 0.5
RETURN p.uuid           AS uuid,
       p.englishName    AS name,
       p.chineseName    AS chineseName,
       p.currentStatus  AS status,
       p.researchInterests AS interests,
       score            AS relevance
ORDER BY score DESC
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 9. findRelatedEntities — Find entities connected to a given entity
// ---------------------------------------------------------------------------
// Params: $uuid (String), $entityType (String), $relationshipTypes ([String]|null), $limit (Int)
// Discovers all connected entities regardless of relationship direction.
MATCH (source {uuid: $uuid})-[r]-(target)
WHERE $relationshipTypes IS NULL OR type(r) IN $relationshipTypes
WITH source, r, target,
     labels(target) AS targetLabels
RETURN target.uuid      AS uuid,
       targetLabels[0]  AS entityType,
       type(r)          AS relationship,
       r.confidence     AS confidence,
       r.source         AS source,
       CASE targetLabels[0]
           WHEN 'Person'    THEN target.englishName
           WHEN 'Lab'       THEN target.name
           WHEN 'University' THEN target.englishName
           WHEN 'Equipment' THEN target.name
           WHEN 'ResearchDirection' THEN target.name
           WHEN 'Paper'     THEN target.title
           ELSE coalesce(target.name, target.title, target.englishName)
       END AS displayName
ORDER BY r.confidence DESC
LIMIT coalesce($limit, 50);

// ---------------------------------------------------------------------------
// 10. searchByResearchInterest — Find researchers by research interest
// ---------------------------------------------------------------------------
// Params: $interest (String), $limit (Int)
MATCH (p:Person)
WHERE ANY(ri IN p.researchInterests WHERE ri CONTAINS $interest)
RETURN p.uuid         AS uuid,
       p.englishName  AS name,
       p.researchInterests AS interests,
       p.currentStatus AS status
ORDER BY p.englishName
LIMIT coalesce($limit, 20);

// ---------------------------------------------------------------------------
// 11. searchLabsByEquipment — Find labs that have a specific type of equipment
// ---------------------------------------------------------------------------
// Params: $equipmentCategory (String), $equipmentName (String|null), $limit (Int)
MATCH (l:Lab)-[:HAS_EQUIPMENT]->(e:Equipment)
WHERE e.category = $equipmentCategory
  AND ($equipmentName IS NULL OR e.name CONTAINS $equipmentName)
RETURN l.uuid        AS uuid,
       l.name        AS labName,
       l.country     AS country,
       l.city        AS city,
       collect(e.name) AS equipment
ORDER BY l.name
LIMIT coalesce($limit, 20);
