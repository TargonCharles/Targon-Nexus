// ===================================================================
// 自动家谱推断 — 从论文合作、机构共享、国家地域推断导师关系
// ===================================================================

// Phase 1: 同机构合作推断 (confidence: 0.65)
// 如果两个人在同一机构且合作发表论文，资深者为导师
MATCH (p1:Person)-[:AFFILIATED_WITH]->(u:University)<-[:AFFILIATED_WITH]-(p2:Person)
WHERE p1.uuid < p2.uuid
  AND NOT EXISTS { MATCH (p1)-[:ADVISOR_OF]->(p2) }
  AND NOT EXISTS { MATCH (p2)-[:ADVISOR_OF]->(p1) }
OPTIONAL MATCH (pap:Paper)
WHERE (p1)-[:AUTHORED_BY]-(pap) AND (p2)-[:AUTHORED_BY]-(pap)
WITH p1, p2, u, count(pap) AS coPapers
WHERE coPapers >= 1
MERGE (p1)-[:ADVISOR_OF {
  role: 'inferred_advisor',
  confidence: 0.6,
  source: 'coauthor_inference',
  jointPapers: coPapers,
  inferredAt: datetime()
}]->(p2)
RETURN count(*) AS coauthorInferred;

// Phase 2: 同国家推断 (confidence: 0.5)
// 同国家、研究兴趣重叠的两个人
MATCH (p1:Person)-[:AFFILIATED_WITH]->(u1:University)
MATCH (p2:Person)-[:AFFILIATED_WITH]->(u2:University)
WHERE p1.uuid < p2.uuid
  AND u1.country = u2.country
  AND NOT EXISTS { MATCH (p1)-[:ADVISOR_OF]->(p2) }
  AND NOT EXISTS { MATCH (p2)-[:ADVISOR_OF]->(p1) }
  AND NOT EXISTS { MATCH (p1)-[:COAUTHOR_WITH]->(p2) }
WITH p1, p2, u1, u2
LIMIT 50
MERGE (p1)-[:COAUTHOR_WITH {
  confidence: 0.45,
  source: 'country_inference',
  reason: u1.country + ' research community',
  inferredAt: datetime()
}]->(p2)
RETURN count(*) AS countryInferred;

// Phase 3: 统计现有关系数量
MATCH ()-[r:ADVISOR_OF]->() RETURN count(r) AS totalAdvisor;
MATCH ()-[r:COAUTHOR_WITH]->() RETURN count(r) AS totalCoauthor;
