// =============================================================================
// ARPES 知识图谱互联脚本
// 链接所有已导入的人物、实验室、设备、研究方向
// 在 Neo4j Browser (http://localhost:7474) 中执行
// =============================================================================

// === 人物互联：Zhi-Xun Shen 的合作网络 ===
MATCH (shen:Person {uuid: 'person-zx-shen'})

// 链接通过名称匹配找到的合作者
MATCH (damascelli:Person) WHERE damascelli.englishName CONTAINS 'Damascelli' OR damascelli.name CONTAINS 'Damascelli'
MERGE (shen)-[:COAUTHOR_WITH {confidence: 0.9, source: 'manual'}]->(damascelli);

MATCH (wang:Person) WHERE wang.englishName CONTAINS 'Shancai' OR wang.englishName CONTAINS 'Wang' OR wang.name CONTAINS 'Shancai'
MERGE (shen)-[:ADVISOR_OF {confidence: 0.9, source: 'manual'}]->(wang);

MATCH (feng:Person) WHERE feng.englishName CONTAINS 'Donglai' OR feng.englishName CONTAINS 'Feng' OR feng.name CONTAINS 'Donglai'
MERGE (shen)-[:COAUTHOR_WITH {confidence: 0.9, source: 'manual'}]->(feng);

MATCH (zhou:Person) WHERE zhou.englishName CONTAINS 'Xingjiang' OR zhou.englishName CONTAINS 'Zhou' OR zhou.name CONTAINS 'Xingjiang'
MERGE (shen)-[:COAUTHOR_WITH {confidence: 0.9, source: 'manual'}]->(zhou);

// === 实验室关联设备 ===
MATCH (lab:Lab {uuid: 'lab-shen-arpes'})
MATCH (da30:Equipment) WHERE da30.name CONTAINS 'DA30' OR da30.name CONTAINS 'Scienta'
MERGE (lab)-[:HAS_EQUIPMENT {confidence: 0.9, source: 'manual'}]->(da30);

MATCH (r4000:Equipment) WHERE r4000.name CONTAINS 'R4000'
MERGE (lab)-[:HAS_EQUIPMENT {confidence: 0.9, source: 'manual'}]->(r4000);

// === 人物关联研究方向 ===
MATCH (p:Person)
MATCH (rd:ResearchDirection)
WHERE (rd.name CONTAINS 'Superconductor' OR rd.name CONTAINS 'Topological' OR rd.name CONTAINS 'Quantum')
  AND (p.englishName IS NOT NULL OR p.name IS NOT NULL)
MERGE (p)-[:RESEARCHES_ON {confidence: 0.7, source: 'manual'}]->(rd);

// === 人物关联大学 ===
MATCH (p:Person), (u:University)
WHERE (p.englishName = 'Zhi-Xun Shen' AND u.englishName = 'Stanford University')
   OR (p.englishName CONTAINS 'Damascelli' AND u.englishName CONTAINS 'British Columbia')
   OR (p.englishName CONTAINS 'Feng' AND u.englishName CONTAINS 'Fudan')
   OR (p.englishName CONTAINS 'Zhou' AND u.englishName CONTAINS 'Chinese Academy')
MERGE (p)-[:WORKS_AT {confidence: 0.9, source: 'manual'}]->(u);

// === 人物关联实验室 ===
MATCH (p:Person), (lab:Lab {uuid: 'lab-shen-arpes'})
WHERE p.englishName CONTAINS 'Shen'
MERGE (p)-[:MEMBER_OF {confidence: 0.95, source: 'manual'}]->(lab);

RETURN 'Knowledge graph linked successfully' AS result;
