// =============================================================================
// Network Queries — Graph Traversal & Network Analysis
// ARP (Targon Nexus) — ARPES Research Community
// =============================================================================
// These queries power the interactive network visualization and analysis
// features of the Targon Nexus. All queries assume parameterized inputs.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. getEgoNetwork — 1-hop ego network for any entity type
// ---------------------------------------------------------------------------
// Params: $uuid (String), $includeProperties (Boolean = true)
// Returns: nodes and relationships for a 1-hop ego network.
MATCH (ego {uuid: $uuid})-[r]-(neighbor)
WITH ego, r, neighbor,
     labels(ego)[0]       AS egoType,
     labels(neighbor)[0]  AS neighborType
RETURN ego.uuid              AS egoId,
       egoType               AS egoLabel,
       neighbor.uuid         AS neighborId,
       neighborType          AS neighborLabel,
       type(r)               AS relationshipType,
       r.confidence          AS confidence,
       r.source              AS source,
       CASE neighborType
           WHEN 'Person'            THEN neighbor.englishName
           WHEN 'Lab'               THEN neighbor.name
           WHEN 'University'        THEN neighbor.englishName
           WHEN 'Equipment'         THEN neighbor.name
           WHEN 'ResearchDirection' THEN neighbor.name
           WHEN 'Paper'             THEN neighbor.title
           ELSE coalesce(neighbor.name, neighbor.title, 'Unknown')
       END AS neighborDisplayName
ORDER BY r.confidence DESC;

// ---------------------------------------------------------------------------
// 2. getExpandedNetwork — 2-hop expanded network
// ---------------------------------------------------------------------------
// Params: $uuid (String), $maxNodes (Int = 100)
// Returns: nodes up to 2 hops from the ego, with relationships between them.
MATCH path = (ego {uuid: $uuid})-[r1]-(n1)-[r2]-(n2)
WHERE n2.uuid <> ego.uuid
WITH
    DISTINCT n1, n2, r1, r2, ego,
    labels(n1)[0] AS label1,
    labels(n2)[0] AS label2
WITH collect(DISTINCT {
    sourceId: coalesce(startNode(r1).uuid, ego.uuid),
    targetId: coalesce(endNode(r1).uuid, n1.uuid),
    type: type(r1)
}) + collect(DISTINCT {
    sourceId: coalesce(startNode(r2).uuid, n1.uuid),
    targetId: coalesce(endNode(r2).uuid, n2.uuid),
    type: type(r2)
}) AS relationships,
collect(DISTINCT n1) + collect(DISTINCT n2) + [ego] AS allNodes
UNWIND allNodes AS node
WITH DISTINCT node, relationships
LIMIT coalesce($maxNodes, 100)
RETURN
    collect(DISTINCT {
        id: node.uuid,
        label: labels(node)[0],
        name: CASE labels(node)[0]
            WHEN 'Person'    THEN node.englishName
            WHEN 'Lab'       THEN node.name
            WHEN 'University' THEN node.englishName
            WHEN 'Equipment' THEN node.name
            WHEN 'ResearchDirection' THEN node.name
            WHEN 'Paper'     THEN node.title
            ELSE coalesce(node.name, node.title, 'Unknown')
        END
    }) AS nodes,
    relationships;

// ---------------------------------------------------------------------------
// 3. getShortestPath — Find the shortest path(s) between two entities
// ---------------------------------------------------------------------------
// Params: $sourceUuid (String), $targetUuid (String), $maxDepth (Int = 4)
// Returns: all shortest paths up to maxDepth.
MATCH (source {uuid: $sourceUuid}), (target {uuid: $targetUuid})
MATCH path = shortestPath((source)-[*..$maxDepth]-(target))
WITH path, nodes(path) AS pathNodes, relationships(path) AS pathRels
UNWIND pathNodes AS node
WITH DISTINCT node, pathRels, path
RETURN
    length(path) AS pathLength,
    [node IN nodes(path) | {
        uuid: node.uuid,
        label: labels(node)[0],
        name: CASE labels(node)[0]
            WHEN 'Person'    THEN node.englishName
            WHEN 'Lab'       THEN node.name
            WHEN 'University' THEN node.englishName
            WHEN 'Equipment' THEN node.name
            WHEN 'ResearchDirection' THEN node.name
            WHEN 'Paper'     THEN node.title
            ELSE coalesce(node.name, node.title, 'Unknown')
        END
    }] AS pathNodes,
    [rel IN relationships(path) | {
        type: type(rel),
        source: rel.source,
        confidence: rel.confidence
    }] AS pathEdges
ORDER BY pathLength;

// ---------------------------------------------------------------------------
// 4. getAdvisorTree — Academic genealogy tree (advisor lineage)
// ---------------------------------------------------------------------------
// Params: $uuid (String), $direction ('ancestors'|'descendants'), $maxDepth (Int = 10)
// Returns: the full advisor/student tree from a given researcher.
CALL {
    // Ancestor direction: follow STUDENT_OF upward (who advised this person's advisors)
    MATCH path = (p:Person {uuid: $uuid})-[:STUDENT_OF*1..$maxDepth]->(ancestor:Person)
    WHERE $direction = 'ancestors'
    RETURN p, ancestor, path, length(path) AS depth
  UNION
    // Descendant direction: follow ADVISOR_OF downward (who did this person advise)
    MATCH path = (p:Person {uuid: $uuid})-[:ADVISOR_OF*1..$maxDepth]->(descendant:Person)
    WHERE $direction = 'descendants'
    RETURN p, descendant, path, length(path) AS depth
}
WITH DISTINCT [node IN nodes(path) | node] AS allNodes, relationships(path) AS allRels, depth
UNWIND allNodes AS node
WITH DISTINCT node, allRels, depth
RETURN
    node.uuid       AS uuid,
    node.englishName AS name,
    node.currentStatus AS status,
    depth           AS generation,
    collect(DISTINCT {
        type: type(rel),
        direction: CASE WHEN startNode(rel).uuid = node.uuid THEN 'outgoing' ELSE 'incoming' END,
        targetUuid: CASE WHEN startNode(rel).uuid = node.uuid THEN endNode(rel).uuid ELSE startNode(rel).uuid END,
        targetName: CASE WHEN startNode(rel).uuid = node.uuid THEN endNode(rel).englishName ELSE startNode(rel).englishName END
    }) AS connections
ORDER BY generation, name;

// ---------------------------------------------------------------------------
// 5. getAlumniFlow — Track alumni career trajectories from a lab
// ---------------------------------------------------------------------------
// Params: $labUuid (String)
// Returns: alumni and their subsequent positions.
MATCH (person:Person)-[:ALUMNI_OF]->(lab:Lab {uuid: $labUuid})
OPTIONAL MATCH (person)-[:MEMBER_OF]->(currentLab:Lab)
OPTIONAL MATCH (person)-[:WORKS_AT]->(currentUni:University)
OPTIONAL MATCH (person)-[:STUDENT_OF]->(advisor:Person)
RETURN
    person.uuid          AS personUuid,
    person.englishName   AS name,
    person.currentStatus AS status,
    lab.name             AS alumniOfLab,
    collect(DISTINCT currentLab.name)[..3]    AS currentLabs,
    collect(DISTINCT currentUni.englishName)[..3] AS currentInstitutions,
    collect(DISTINCT advisor.englishName)[..3]    AS advisors
ORDER BY name;

// ---------------------------------------------------------------------------
// 6. getCollaborationNetwork — Collaboration graph between researchers/labs
// ---------------------------------------------------------------------------
// Params: $researchDirectionUuid (String|null), $minPapers (Int = 1), $limit (Int = 50)
// Returns: co-authorship and collaboration edges for network visualization.
MATCH (p1:Person)-[r:COAUTHOR_WITH]-(p2:Person)
WHERE
    ($researchDirectionUuid IS NULL
     OR EXISTS((p1)-[:RESEARCHES_ON]->(:ResearchDirection {uuid: $researchDirectionUuid}))
     OR EXISTS((p2)-[:RESEARCHES_ON]->(:ResearchDirection {uuid: $researchDirectionUuid})))
    AND r.paperCount >= $minPapers
WITH p1, p2, r
RETURN
    p1.uuid             AS sourceId,
    p1.englishName      AS sourceName,
    p2.uuid             AS targetId,
    p2.englishName      AS targetName,
    r.paperCount        AS weight,
    r.firstYear         AS firstCollaboration,
    r.lastYear          AS lastCollaboration,
    type(r)             AS relationshipType
ORDER BY r.paperCount DESC
LIMIT coalesce($limit, 50);

// ---------------------------------------------------------------------------
// 7. getResearchDirectionNetwork — Subgraph of research directions and researchers
// ---------------------------------------------------------------------------
// Params: $directionUuid (String), $includeResearchers (Boolean = true), $limit (Int = 30)
// Returns: related research directions and active researchers in each.
MATCH (rd:ResearchDirection {uuid: $directionUuid})
OPTIONAL MATCH (rd)-[:PARENT_OF*0..2]-(relatedRD:ResearchDirection)
WITH DISTINCT relatedRD AS rdNode, rd
WHERE rdNode.uuid <> rd.uuid
OPTIONAL MATCH (person:Person)-[:RESEARCHES_ON]->(rdNode)
WITH rdNode, collect(DISTINCT {
    uuid: person.uuid,
    name: person.englishName
})[..coalesce($limit, 30)] AS researchers
RETURN
    rdNode.uuid        AS uuid,
    rdNode.name        AS name,
    rdNode.level       AS level,
    researchers,
    size(researchers)  AS researcherCount
ORDER BY researcherCount DESC;

// ---------------------------------------------------------------------------
// 8. getEquipmentNetwork — Equipment sharing and capability network
// ---------------------------------------------------------------------------
// Params: $equipmentUuid (String|null), $category (String|null), $limit (Int = 30)
// Returns: labs connected through shared equipment types.
MATCH (l1:Lab)-[:HAS_EQUIPMENT]->(e:Equipment)<-[:HAS_EQUIPMENT]-(l2:Lab)
WHERE
    ($equipmentUuid IS NULL OR e.uuid = $equipmentUuid)
    AND ($category IS NULL OR e.category = $category)
    AND l1.uuid < l2.uuid
WITH l1, l2, collect(DISTINCT {name: e.name, category: e.category}) AS sharedEquipment
RETURN
    l1.uuid             AS lab1Uuid,
    l1.name             AS lab1Name,
    l1.country          AS lab1Country,
    l2.uuid             AS lab2Uuid,
    l2.name             AS lab2Name,
    l2.country          AS lab2Country,
    sharedEquipment,
    size(sharedEquipment) AS equipmentCount
ORDER BY equipmentCount DESC
LIMIT coalesce($limit, 30);

// ---------------------------------------------------------------------------
// 9. getCoAuthorshipGraph — Detailed co-authorship network for a person
// ---------------------------------------------------------------------------
// Params: $uuid (String), $minSharedPapers (Int = 1)
// Returns: co-author connections with shared paper details.
MATCH (p:Person {uuid: $uuid})-[:PUBLISHED]->(paper:Paper)<-[:PUBLISHED]-(coauthor:Person)
WHERE coauthor.uuid <> p.uuid
WITH coauthor, count(paper) AS sharedPapers, collect(paper.doi)[..5] AS paperDois
WHERE sharedPapers >= $minSharedPapers
RETURN
    coauthor.uuid        AS uuid,
    coauthor.englishName AS name,
    sharedPapers         AS collaborationCount,
    paperDois            AS samplePapers
ORDER BY sharedPapers DESC
LIMIT 30;

// ---------------------------------------------------------------------------
// 10. getInstitutionalGraph — University-Lab-Person hierarchy
// ---------------------------------------------------------------------------
// Params: $universityUuid (String), $includePeople (Boolean = false)
MATCH (u:University {uuid: $universityUuid})
OPTIONAL MATCH (u)-[:HAS_LAB]->(lab:Lab)
OPTIONAL MATCH (u)-[:HAS_SCHOOL]->(school:University)
OPTIONAL MATCH (u)-[:HAS_DEPARTMENT]->(dept:University)
WITH u, collect(DISTINCT {uuid: lab.uuid, name: lab.name, type: 'Lab'}) AS labs,
        collect(DISTINCT {uuid: school.uuid, name: school.englishName, type: 'School'}) AS schools,
        collect(DISTINCT {uuid: dept.uuid, name: dept.englishName, type: 'Department'}) AS departments
OPTIONAL MATCH (u)<-[:WORKS_AT|AFFILIATED_WITH]-(person:Person)
WITH u, labs, schools, departments,
     CASE WHEN $includePeople
          THEN collect(DISTINCT {uuid: person.uuid, name: person.englishName, type: 'Person'})
          ELSE []
     END AS people
RETURN
    u.uuid        AS uuid,
    u.englishName AS name,
    u.country     AS country,
    u.city        AS city,
    labs, schools, departments, people,
    size(labs) + size(schools) + size(departments) + size(people) AS totalEntities;
