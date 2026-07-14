// ===================================================================
// 人物去重 + 家谱全面扩展
// 在 Neo4j Browser (http://localhost:7474) 中粘贴执行
// ===================================================================

// === Phase 1: 合并重复人物 ===

// Shen Zhixun → Zhi-Xun Shen (保留 person-zx-shen)
MATCH (old:Person {uuid:"person-zx-shen"})
MATCH (dup:Person {uuid:"770e8400-e29b-41d4-a716-446655440002"})
SET old.orcid = coalesce(old.orcid, dup.orcid),
    old.homepage = coalesce(old.homepage, dup.homepage),
    old.email = coalesce(old.email, dup.email)
WITH old, dup
MATCH (dup)-[r]->(n) CALL { WITH old,dup,r,n MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup
MATCH (n)-[r]->(dup) CALL { WITH old,dup,r,n MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup DETACH DELETE dup RETURN 'Shen merged' AS result;

// Damascelli Andrea → Andrea Damascelli
MATCH (old:Person {uuid:"person-damascelli"})
MATCH (dup:Person {uuid:"770e8400-e29b-41d4-a716-446655440021"})
SET old.orcid = coalesce(old.orcid, dup.orcid)
WITH old, dup
MATCH (dup)-[r]->(n) CALL { WITH old,dup,r,n MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup
MATCH (n)-[r]->(dup) CALL { WITH old,dup,r,n MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup DETACH DELETE dup RETURN 'Damascelli merged' AS result;

// Lanzara Alessandra → Alessandra Lanzara
MATCH (old:Person {uuid:"person-lanzara"})
MATCH (dup:Person {uuid:"770e8400-e29b-41d4-a716-446655440007"})
SET old.orcid = coalesce(old.orcid, dup.orcid)
WITH old, dup
MATCH (dup)-[r]->(n) CALL { WITH old,dup,r,n MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup
MATCH (n)-[r]->(dup) CALL { WITH old,dup,r,n MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup DETACH DELETE dup RETURN 'Lanzara merged' AS result;

// Comin Riccardo → (keep as Riccardo Comin, find canonical)
MATCH (dup:Person {uuid:"770e8400-e29b-41d4-a716-446655440006"})
MATCH (old:Person) WHERE old.englishName = "Riccardo Comin" AND old.uuid <> dup.uuid
WITH old, dup LIMIT 1
MATCH (dup)-[r]->(n) CALL { WITH old,dup,r,n MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup
MATCH (n)-[r]->(dup) CALL { WITH old,dup,r,n MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup DETACH DELETE dup RETURN 'Comin merged' AS result;

// Xingjiang Zhou duplicates
MATCH (dups:Person) WHERE dups.englishName = "Xingjiang Zhou"
WITH collect(dups) AS nodes
WITH nodes[0] AS old, nodes[1] AS dup
WHERE dup IS NOT NULL
MATCH (dup)-[r]->(n) CALL { WITH old,dup,r,n MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup
MATCH (n)-[r]->(dup) CALL { WITH old,dup,r,n MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r) } IN TRANSACTIONS
WITH old, dup DETACH DELETE dup RETURN 'Zhou merged' AS result;

// === Phase 2: 统计 ===
MATCH (p:Person) RETURN count(p) AS totalPersons;
MATCH ()-[r:ADVISOR_OF]->() RETURN count(r) AS totalAdvisor;
MATCH ()-[r:COAUTHOR_WITH]->() RETURN count(r) AS totalCoauthor;
