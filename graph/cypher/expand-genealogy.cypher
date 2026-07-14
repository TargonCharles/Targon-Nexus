// ===================================================================
// 扩展家谱 — 基于已知 ARPES 领域导师链批量创建
// 执行: POST /api/v1/pipeline/seed 或直接 Cypher
// ===================================================================

// Level 1: 导师 → 学生
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Donglai Feng'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Yulin Chen'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Shancai Wang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Alessandra Lanzara'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Yu He'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Kyle Shen'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Riccardo Comin'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}) MATCH (s:Person {englishName:'Donghui Lu'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Xingjiang Zhou'}) MATCH (s:Person {englishName:'Lin Zhao'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Xingjiang Zhou'}) MATCH (s:Person {englishName:'Wentao Zhang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Xingjiang Zhou'}) MATCH (s:Person {englishName:'Peng Zhang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Xingjiang Zhou'}) MATCH (s:Person {englishName:'Nan Xu'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Donglai Feng'}) MATCH (s:Person {englishName:'Jialing Qian'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Donglai Feng'}) MATCH (s:Person {englishName:'Tian Qian'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Donglai Feng'}) MATCH (s:Person {englishName:'Wentao Zhang'}) MERGE (a)-[:ADVISOR_OF {role:'co_advisor',confidence:0.8,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Andrea Damascelli'}) MATCH (s:Person {englishName:'Jonathan Sobral'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Andrea Damascelli'}) MATCH (s:Person {englishName:'Riccardo Comin'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Alessandra Lanzara'}) MATCH (s:Person {englishName:'Luca Moreschini'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Takashi Takahashi'}) MATCH (s:Person {englishName:'Takeshi Kondo'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Takashi Takahashi'}) MATCH (s:Person {englishName:'Shik Shin'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Takashi Takahashi'}) MATCH (s:Person {englishName:'Takafumi Sato'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Hong Ding'}) MATCH (s:Person {englishName:'Guodong Liu'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Hong Ding'}) MATCH (s:Person {englishName:'Dawei Shen'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Hong Ding'}) MATCH (s:Person {englishName:'Yaobo Huang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.8,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Qikun Xue'}) MATCH (s:Person {englishName:'Jinfeng Jia'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.9,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Qikun Xue'}) MATCH (s:Person {englishName:'Yayu Wang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Jialing Qian'}) MATCH (s:Person {englishName:'Peng Zhang'}) MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.8,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Ming Shi'}) MATCH (s:Person {englishName:'Nicholas C. Plumb'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Ming Shi'}) MATCH (s:Person {englishName:'Jun Fujii'}) MERGE (a)-[:ADVISOR_OF {role:'collaborator',confidence:0.7,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Tonica Valla'}) MATCH (s:Person {englishName:'Peter D. Johnson'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85,source:'manual'}]->(s);
MATCH (a:Person {englishName:'Tonica Valla'}) MATCH (s:Person {englishName:'Adam Kaminski'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.8,source:'manual'}]->(s);

MATCH (a:Person {englishName:'Keun Su Kim'}) MATCH (s:Person {englishName:'Changyoung Kim'}) MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85,source:'manual'}]->(s);

RETURN 'Genealogy expanded — ' + toString(size([(a)-[:ADVISOR_OF]->() | a])) + ' advisor relationships total' AS result;
