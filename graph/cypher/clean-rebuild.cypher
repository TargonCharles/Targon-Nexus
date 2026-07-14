// ===================================================================
// 彻底清理 + 重建正确家谱
// 在 Neo4j Browser (http://localhost:7474) 中执行
// ===================================================================

// === Phase 1: 删除所有低质量自动推断边 ===
MATCH ()-[r:ADVISOR_OF]->() WHERE r.confidence < 0.6 DELETE r RETURN 'Cleaned low-conf advisor edges' AS result;
MATCH ()-[r:COAUTHOR_WITH]->() WHERE r.confidence < 0.5 DELETE r RETURN 'Cleaned low-conf coauthor edges' AS result;

// === Phase 2: 删除错误的 AFFILIATED_WITH ===
MATCH ()-[r:AFFILIATED_WITH]->() WHERE r.confidence < 0.5 DELETE r RETURN 'Cleaned low-conf affiliations' AS result;

// === Phase 3: 合并重复人物（彻底版） ===

// 3a. 合并同一 ORCID
MATCH (p:Person) WHERE p.orcid IS NOT NULL
WITH p.orcid AS orcid, collect(p) AS dups, count(*) AS cnt WHERE cnt > 1
WITH dups[0] AS keep, tail(dups) AS removeList
UNWIND removeList AS dup
MATCH (dup)-[r]->(n) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (keep)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup
MATCH (n)-[r]->(dup) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (n)-[r2:type(r)]->(keep) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup
SET keep.orcid = coalesce(keep.orcid, dup.orcid),
    keep.homepage = coalesce(keep.homepage, dup.homepage),
    keep.email = coalesce(keep.email, dup.email)
WITH keep, dup DETACH DELETE dup
RETURN count(*) AS orcidMerged;

// 3b. 合并姓名相同但 UUID 不同
MATCH (p:Person) WHERE p.englishName IS NOT NULL
WITH p.englishName AS name, collect(p) AS dups, count(*) AS cnt WHERE cnt > 1
WITH name, dups[0] AS keep, tail(dups) AS removeList
UNWIND removeList AS dup
MATCH (dup)-[r]->(n) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (keep)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup, name
MATCH (n)-[r]->(dup) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (n)-[r2:type(r)]->(keep) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup, name
SET keep.englishName = name
WITH keep, dup DETACH DELETE dup
RETURN count(*) AS nameMerged;

// 3c. 合并姓名分词相同的人（FirstName LastName ↔ LastName FirstName）
MATCH (p:Person) WHERE p.englishName IS NOT NULL
WITH p, split(toLower(p.englishName), ' ') AS parts
WITH p, apoc.coll.sort(parts) AS sorted
WITH apoc.text.join(sorted, ' ') AS key, collect(p) AS dups, count(*) AS cnt
WHERE cnt > 1
WITH dups[0] AS keep, tail(dups) AS removeList
UNWIND removeList AS dup
MATCH (dup)-[r]->(n) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (keep)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup
MATCH (n)-[r]->(dup) WHERE n.uuid <> keep.uuid
CALL { WITH keep, r, n MERGE (n)-[r2:type(r)]->(keep) SET r2 = properties(r) } IN TRANSACTIONS
WITH keep, dup
SET keep.orcid = coalesce(keep.orcid, dup.orcid),
    keep.email = coalesce(keep.email, dup.email)
WITH keep, dup DETACH DELETE dup
RETURN count(*) AS fuzzyMerged;

// === 最终统计 ===
MATCH (p:Person) RETURN count(p) AS totalPersons;
MATCH ()-[r:ADVISOR_OF]->() RETURN count(r) AS advisorEdges;
MATCH ()-[r:COAUTHOR_WITH]->() RETURN count(r) AS coauthorEdges;
