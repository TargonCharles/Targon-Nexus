// =============================================================================
// Timeline Queries — Temporal Analysis & Event Tracking
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// These queries power temporal views: career timelines, lab histories,
// research trend analysis, and equipment evolution.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. getPersonTimeline — Career timeline for a researcher
// ---------------------------------------------------------------------------
// Params: $uuid (String)
// Returns: chronological events (publications, position changes, etc.)
CALL {
    // Publication events
    MATCH (p:Person {uuid: $uuid})-[:PUBLISHED]->(paper:Paper)
    RETURN
        paper.year   AS eventYear,
        'Publication' AS eventType,
        paper.title  AS description,
        paper.doi    AS reference,
        paper.journal AS venue,
        paper.citationCount AS citations
  UNION ALL
    // Lab membership events
    MATCH (p:Person {uuid: $uuid})-[r:MEMBER_OF|ALUMNI_OF]->(lab:Lab)
    RETURN
        r.startYear  AS eventYear,
        CASE WHEN type(r) = 'MEMBER_OF' THEN 'Joined Lab' ELSE 'Left Lab' END AS eventType,
        lab.name + ' (' + coalesce(r.role, 'member') + ')' AS description,
        lab.uuid     AS reference,
        lab.name     AS venue,
        null         AS citations
  UNION ALL
    // Institutional affiliation events
    MATCH (p:Person {uuid: $uuid})-[r:WORKS_AT]->(u:University)
    RETURN
        r.startYear   AS eventYear,
        'Started at Institution' AS eventType,
        u.englishName + ' (' + coalesce(r.department, '') + ')' AS description,
        u.uuid        AS reference,
        u.englishName AS venue,
        null          AS citations
  UNION ALL
    // Advisor/Student milestones
    MATCH (p:Person {uuid: $uuid})-[r:STUDENT_OF]->(advisor:Person)
    WHERE r.startYear IS NOT NULL
    RETURN
        r.startYear   AS eventYear,
        'Became Student' AS eventType,
        'Under ' + advisor.englishName AS description,
        advisor.uuid  AS reference,
        null          AS venue,
        null          AS citations
  UNION ALL
    // Equipment usage
    MATCH (e:Equipment)-[r:USED_BY]->(p:Person {uuid: $uuid})
    WHERE r.startYear IS NOT NULL
    RETURN
        r.startYear   AS eventYear,
        'Started Using ' + e.category AS eventType,
        e.name AS description,
        e.uuid        AS reference,
        null          AS venue,
        null          AS citations
}
WHERE eventYear IS NOT NULL
RETURN eventYear, eventType, description, reference, venue, citations
ORDER BY eventYear ASC;

// ---------------------------------------------------------------------------
// 2. getLabTimeline — Historical timeline of a lab
// ---------------------------------------------------------------------------
// Params: $uuid (String)
// Returns: key events in a lab's history.
CALL {
    // Lab founding
    MATCH (l:Lab {uuid: $uuid})
    WHERE l.foundedYear IS NOT NULL
    RETURN
        l.foundedYear AS eventYear,
        'Founded'     AS eventType,
        l.name + ' established' AS description,
        l.uuid        AS reference
  UNION ALL
    // Member arrivals
    MATCH (person:Person)-[r:MEMBER_OF]->(l:Lab {uuid: $uuid})
    WHERE r.startYear IS NOT NULL
    RETURN
        r.startYear  AS eventYear,
        'Member Joined' AS eventType,
        person.englishName + ' joined as ' + coalesce(r.role, 'member') AS description,
        person.uuid  AS reference
  UNION ALL
    // Member departures (from alumni records)
    MATCH (person:Person)-[r:ALUMNI_OF]->(l:Lab {uuid: $uuid})
    WHERE r.endYear IS NOT NULL
    RETURN
        r.endYear    AS eventYear,
        'Member Left' AS eventType,
        person.englishName + ' left (' + coalesce(r.role, 'member') + ')' AS description,
        person.uuid  AS reference
  UNION ALL
    // Equipment acquisitions
    MATCH (l:Lab {uuid: $uuid})-[r:HAS_EQUIPMENT]->(e:Equipment)
    WHERE r.acquisitionYear IS NOT NULL
    RETURN
        r.acquisitionYear AS eventYear,
        'Equipment Acquired' AS eventType,
        e.name + ' (' + coalesce(e.category, 'equipment') + ')' AS description,
        e.uuid        AS reference
  UNION ALL
    // Key publications (top-cited papers from lab members)
    MATCH (l:Lab {uuid: $uuid})<-[:MEMBER_OF|ALUMNI_OF]-(person:Person)-[:PUBLISHED]->(paper:Paper)
    WHERE paper.citationCount >= 50
    RETURN
        paper.year   AS eventYear,
        'High-Impact Publication' AS eventType,
        paper.title  AS description,
        paper.doi    AS reference
}
WHERE eventYear IS NOT NULL
RETURN eventYear, eventType, description, reference
ORDER BY eventYear ASC;

// ---------------------------------------------------------------------------
// 3. getResearchDirectionTimeline — Trend analysis for a research direction
// ---------------------------------------------------------------------------
// Params: $directionUuid (String)
// Returns: publication counts and key papers over time.
MATCH (rd:ResearchDirection {uuid: $directionUuid})
OPTIONAL MATCH (rd)<-[:ABOUT]-(paper:Paper)
WITH rd, paper
WHERE paper IS NOT NULL
WITH paper.year AS year, count(paper) AS paperCount,
     collect(paper.title)[..3] AS topPapers
RETURN
    year,
    paperCount,
    topPapers
ORDER BY year ASC;

// ---------------------------------------------------------------------------
// 4. getEquipmentTimeline — Equipment development and adoption over time
// ---------------------------------------------------------------------------
// Params: $category (String|null)
// Returns: equipment adoption timeline by category.
CALL {
    // Equipment acquisition timeline
    MATCH (l:Lab)-[r:HAS_EQUIPMENT]->(e:Equipment)
    WHERE ($category IS NULL OR e.category = $category)
      AND r.acquisitionYear IS NOT NULL
    RETURN
        r.acquisitionYear AS year,
        e.category        AS category,
        e.name            AS equipmentName,
        l.name            AS labName,
        l.country         AS country,
        'acquisition'     AS eventSubtype
  UNION ALL
    // Equipment usage timeline
    MATCH (e:Equipment)-[r:USED_BY]->(p:Person)
    WHERE ($category IS NULL OR e.category = $category)
      AND r.startYear IS NOT NULL
    RETURN
        r.startYear       AS year,
        e.category        AS category,
        e.name            AS equipmentName,
        p.englishName     AS labName,
        null              AS country,
        'first_use'       AS eventSubtype
}
RETURN year, category, equipmentName, labName, country, eventSubtype
ORDER BY year ASC;

// ---------------------------------------------------------------------------
// 5. getRecentEvents — Dashboard feed of recent activity across the platform
// ---------------------------------------------------------------------------
// Params: $sinceDays (Int = 30), $limit (Int = 50)
// Returns: recently created/updated entities and relationships.
WITH datetime() - duration({days: coalesce($sinceDays, 30)}) AS cutoff

CALL {
    // Recently updated Persons
    MATCH (p:Person)
    WHERE p.updatedAt >= cutoff
    RETURN
        p.updatedAt   AS eventTime,
        'Person Updated' AS eventType,
        p.englishName + ' profile updated' AS description,
        p.uuid        AS entityId,
        'Person'      AS entityType
  UNION ALL
    // Recently added papers
    MATCH (p:Paper)
    WHERE p.createdAt >= cutoff
    RETURN
        p.createdAt   AS eventTime,
        'Paper Added' AS eventType,
        left(p.title, 100) + '...' AS description,
        p.uuid        AS entityId,
        'Paper'       AS entityType
  UNION ALL
    // Recently updated labs
    MATCH (l:Lab)
    WHERE l.updatedAt >= cutoff
    RETURN
        l.updatedAt   AS eventTime,
        'Lab Updated' AS eventType,
        l.name + ' lab updated' AS description,
        l.uuid        AS entityId,
        'Lab'         AS entityType
  UNION ALL
    // Recently verified relationships — use anchored patterns to avoid full graph scan.
    // Each UNION targets a specific relationship type with node labels for index usage.
    MATCH (person:Person)-[r:MEMBER_OF|ALUMNI_OF|COAUTHOR_WITH|ADVISOR_OF|STUDENT_OF]-(other)
    WHERE r.verifiedAt >= cutoff
    RETURN
        r.verifiedAt  AS eventTime,
        'Relationship Verified' AS eventType,
        type(r) + ' relationship verified' AS description,
        person.uuid   AS entityId,
        'Person'      AS entityType
    LIMIT 20
  UNION ALL
    MATCH (lab:Lab)-[r:COLLABORATES_WITH|HAS_EQUIPMENT|BELONGS_TO|PART_OF]-(other)
    WHERE r.verifiedAt >= cutoff
    RETURN
        r.verifiedAt  AS eventTime,
        'Relationship Verified' AS eventType,
        type(r) + ' relationship verified' AS description,
        lab.uuid      AS entityId,
        'Lab'         AS entityType
    LIMIT 20
  UNION ALL
    // New members joining labs
    MATCH (person:Person)-[r:MEMBER_OF]->(lab:Lab)
    WHERE r.collectedAt >= cutoff
    RETURN
        r.collectedAt AS eventTime,
        'New Member Joined' AS eventType,
        person.englishName + ' joined ' + lab.name AS description,
        person.uuid   AS entityId,
        'Person'      AS entityType
}
RETURN eventTime, eventType, description, entityId, entityType
ORDER BY eventTime DESC
LIMIT coalesce($limit, 50);

// ---------------------------------------------------------------------------
// 6. getPublicationTimeline — Career publication timeline
// ---------------------------------------------------------------------------
// Params: $personUuid (String)
// Returns: year-by-year publication counts and cumulative citations.
MATCH (p:Person {uuid: $personUuid})-[:PUBLISHED]->(paper:Paper)
WITH paper.year AS year,
     count(paper) AS papersThisYear,
     sum(paper.citationCount) AS citationsThisYear
ORDER BY year ASC
RETURN
    year,
    papersThisYear,
    citationsThisYear,
    sum(papersThisYear) OVER (ORDER BY year) AS cumulativePapers,
    sum(citationsThisYear) OVER (ORDER BY year) AS cumulativeCitations
ORDER BY year;

// ---------------------------------------------------------------------------
// 7. getCollaborationTimeline — First collaborations over time
// ---------------------------------------------------------------------------
// Params: $personUuid (String)
MATCH (p:Person {uuid: $personUuid})-[r:COAUTHOR_WITH]-(coauthor:Person)
WHERE r.firstYear IS NOT NULL
RETURN
    r.firstYear  AS year,
    coauthor.englishName AS coauthor,
    r.paperCount AS totalPapers,
    r.lastYear   AS latestCollaboration
ORDER BY year ASC;

// ---------------------------------------------------------------------------
// 8. getFieldEvolution — Evolution of a research field over time
// ---------------------------------------------------------------------------
// Params: $directionUuid (String), $granularity ('year'|'decade')
// Returns: aggregated metrics showing how a field has grown/changed.
MATCH (rd:ResearchDirection {uuid: $directionUuid})
MATCH (rd)<-[:ABOUT]-(paper:Paper)
WITH
    CASE $granularity
        WHEN 'year'  THEN toString(paper.year)
        WHEN 'decade' THEN toString((paper.year / 10) * 10) + 's'
        ELSE toString(paper.year)
    END AS period,
    paper
RETURN
    period,
    count(paper)                                          AS paperCount,
    sum(paper.citationCount)                              AS totalCitations,
    round(avg(paper.citationCount) * 100) / 100          AS avgCitations,
    collect(DISTINCT paper.journal)[..5]                  AS topJournals
ORDER BY period ASC;
