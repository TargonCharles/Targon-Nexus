// 批量家谱 — 使用数据库中实际名称
// 格式: 导师名(英文) → 学生名(英文)

// === 沈志勋 (Zhi-Xun Shen) — Stanford ===
MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Donglai Feng','Feng Donglai'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Yulin Chen','Chen Yulin'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.95}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Alessandra Lanzara','Lanzara Alessandra'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Shen Kyle','Kyle Shen'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Comin Riccardo','Riccardo Comin'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Lu Donghui','Donghui Lu'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Zhi-Xun Shen','Shen Zhixun'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Lanzara Alessandra','Alessandra Lanzara'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9}]->(s);

// === 周兴江 (Xingjiang Zhou) — IOP-CAS ===
MATCH (a:Person) WHERE a.englishName IN ['Xingjiang Zhou','Zhou Xingjiang'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Lin Zhao','Zhao Lin'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Xingjiang Zhou','Zhou Xingjiang'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Wentao Zhang','Zhang Wentao'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.95}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Xingjiang Zhou','Zhou Xingjiang'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Zhang Peng','Peng Zhang'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Xingjiang Zhou','Zhou Xingjiang'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Xu Nan','Nan Xu'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === 封东来 (Donglai Feng) — Fudan ===
MATCH (a:Person) WHERE a.englishName IN ['Donglai Feng','Feng Donglai'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Jialing Qian','Qian Jialing'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Donglai Feng','Feng Donglai'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Tian Qian','Qian Tian'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === Damascelli — UBC ===
MATCH (a:Person) WHERE a.englishName IN ['Andrea Damascelli','Damascelli Andrea'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Jonathan Sobral'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Andrea Damascelli','Damascelli Andrea'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Comin Riccardo','Riccardo Comin'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85}]->(s);

// === Takahashi — Tokyo ===
MATCH (a:Person) WHERE a.englishName = 'Takahashi Takashi' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Takeshi Kondo','Kondo Takeshi'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName = 'Takahashi Takashi' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Shin Shik','Shik Shin'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

MATCH (a:Person) WHERE a.englishName = 'Takahashi Takashi' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Sato Takafumi','Takafumi Sato'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === 丁洪 — IOP-CAS ===
MATCH (a:Person) WHERE a.englishName = 'Ding Hong' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Guodong Liu','Liu Guodong'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName = 'Ding Hong' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Shen Dawei','Dawei Shen'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === 薛其坤 — Tsinghua ===
MATCH (a:Person) WHERE a.englishName = 'Xue Qikun' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName = 'Jia Jinfeng' WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.9}]->(s);

MATCH (a:Person) WHERE a.englishName = 'Xue Qikun' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Wang Yayu','Yayu Wang'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === Lanzara — Berkeley ===
MATCH (a:Person) WHERE a.englishName IN ['Alessandra Lanzara','Lanzara Alessandra'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Moreschini Luca','Luca Moreschini'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.85}]->(s);

// === Valla — BNL ===
MATCH (a:Person) WHERE a.englishName = 'Valla Tonica' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Johnson Peter D.','Peter D. Johnson'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85}]->(s);

// === Kim Keun Su — POSTECH ===
MATCH (a:Person) WHERE a.englishName = 'Kim Keun Su' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Kim Changyoung','Changyoung Kim'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85}]->(s);

// === Ming Shi — PSI ===
MATCH (a:Person) WHERE a.englishName = 'Shi Ming' WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName = 'Plumb Nicholas C.' WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'postdoc_advisor',confidence:0.85}]->(s);

// === 二代学生 (Grand-students) ===
MATCH (a:Person) WHERE a.englishName IN ['Jialing Qian','Qian Jialing'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Zhang Peng','Peng Zhang'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.8}]->(s);

MATCH (a:Person) WHERE a.englishName IN ['Kim Changyoung','Changyoung Kim'] WITH a LIMIT 1
MATCH (s:Person) WHERE s.englishName IN ['Kim Young Kuk','Young Kuk Kim'] WITH a,s LIMIT 1 MERGE (a)-[:ADVISOR_OF {role:'phd_advisor',confidence:0.75}]->(s);

RETURN 'mass-genealogy seeded' AS result;
