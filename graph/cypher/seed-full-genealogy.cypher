// ===================================================================
// 完整学术家谱 — ARPES 领域核心导师-学生关系链
// ===================================================================

// === 沈志勋家谱 (Stanford) ===
// 导师: Robert Laughlin → 沈志勋
MATCH (a:Person {englishName:'Zhi-Xun Shen'}), (s:Person {englishName:'Donglai Feng'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:1998, confidence:0.95, source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}), (s:Person {englishName:'Shancai Wang'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2005, confidence:0.95, source:'manual'}]->(s);
MATCH (a:Person {englishName:'Zhi-Xun Shen'}), (s:Person {englishName:'Yulin Chen'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2010, confidence:0.95, source:'manual'}]->(s);

// === 封东来家谱 (Fudan) ===
MATCH (a:Person {englishName:'Donglai Feng'}), (s:Person {englishName:'Jialing Qian'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2012, confidence:0.9, source:'manual'}]->(s);

// === 周兴江家谱 (IOP-CAS) ===
MATCH (a:Person {englishName:'Xingjiang Zhou'}), (s:Person {englishName:'Lin Zhao'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2008, confidence:0.95, source:'manual'}]->(s);
MATCH (a:Person {englishName:'Xingjiang Zhou'}), (s:Person {englishName:'Wentao Zhang'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2010, confidence:0.9, source:'manual'}]->(s);

// === Damascelli家谱 (UBC) ===
MATCH (a:Person {englishName:'Andrea Damascelli'}), (s:Person {englishName:'Jonathan Sobral'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2018, confidence:0.9, source:'manual'}]->(s);

// === Comin家谱 (MIT) ===
// Comin曾是Damascelli的博士后
MATCH (a:Person {englishName:'Andrea Damascelli'}), (s:Person {englishName:'Riccardo Comin'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2012, confidence:0.9, source:'manual'}]->(s);

// === Lanzara家谱 (Berkeley) ===
// Lanzara曾是沈志勋的学生
MATCH (a:Person {englishName:'Zhi-Xun Shen'}), (s:Person {englishName:'Alessandra Lanzara'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2000, confidence:0.95, source:'manual'}]->(s);

// === Takahashi家谱 (Tokyo) ===
MATCH (a:Person {englishName:'Takashi Takahashi'}), (s:Person {englishName:'Takeshi Kondo'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2008, confidence:0.9, source:'manual'}]->(s);

// === 薛其坤家谱 (Tsinghua) ===
MATCH (a:Person {englishName:'Qikun Xue'}), (s:Person {englishName:'Jinfeng Jia'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2010, confidence:0.9, source:'manual'}]->(s);

// === Kim家谱 (POSTECH) ===
MATCH (a:Person {englishName:'Keun Su Kim'}), (s:Person {englishName:'Changyoung Kim'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2006, confidence:0.85, source:'manual'}]->(s);

// === 丁洪家谱 (IOP-CAS) ===
MATCH (a:Person {englishName:'Hong Ding'}), (s:Person {englishName:'Dawei Shen'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2012, confidence:0.9, source:'manual'}]->(s);
MATCH (a:Person {englishName:'Hong Ding'}), (s:Person {englishName:'Guodong Liu'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2008, confidence:0.9, source:'manual'}]->(s);

// === 陈仙辉家谱 (USTC) ===
MATCH (a:Person {englishName:'Xianhui Chen'}), (s:Person {englishName:'Haiyang Bai'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2010, confidence:0.85, source:'manual'}]->(s);

// === Valla家谱 (BNL) ===
MATCH (a:Person {englishName:'Tonica Valla'}), (s:Person {englishName:'Peter D. Johnson'})
MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor', startYear:2005, confidence:0.85, source:'manual'}]->(s);

// === 二代学生 (Grand-students) ===
// 封东来的学生的学生
MATCH (a:Person {englishName:'Jialing Qian'}), (s:Person {englishName:'Peng Zhang'})
MERGE (a)-[:ADVISOR_OF {role:'phd_advisor', startYear:2018, confidence:0.8, source:'manual'}]->(s);

// === 修复脏边 — 删除错误的 ADVISOR_OF 关系 ===
MATCH (a)-[r:ADVISOR_OF]->(b) WHERE a.uuid STARTS WITH 'http' DELETE r;

RETURN 'Full genealogy seeded' AS result;
