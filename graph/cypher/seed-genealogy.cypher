// ===================================================================
// ARPES 学术家谱 + 全球实验室 — 补充数据
// ===================================================================

// === 导师链 ===
CREATE (laughlin:Person {uuid:'person-robert-laughlin', englishName:'Robert Laughlin', chineseName:'Robert Laughlin', currentStatus:'Professor Emeritus', researchInterests:['Condensed Matter Theory','Quantum Hall Effect']});
CREATE (stanford:University {uuid:'univ-stanford'}) ON CREATE SET stanford.englishName='Stanford University', stanford.country='USA', stanford.city='Stanford';
MATCH (p:Person {uuid:'person-zx-shen'}), (a:Person {uuid:'person-robert-laughlin'}) MERGE (a)-[:ADVISOR_OF {confidence:1.0}]->(p);
MATCH (p:Person {uuid:'person-robert-laughlin'}), (u:University {uuid:'univ-stanford'}) MERGE (p)-[:WORKS_AT {confidence:1.0}]->(u);

// === 全球实验室 ===
CREATE (:Lab {uuid:'lab-kondo-tokyo', name:'Kondo Group', englishName:'Kondo Group', country:'Japan', city:'Tokyo', keywords:['Laser ARPES','Superconductor'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-takahashi-tohoku', name:'Takahashi Group', englishName:'Takahashi Group', country:'Japan', city:'Sendai', keywords:['ARPES','Topological'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-kim-postech', name:'Kim Group', englishName:'Kim Group', country:'Korea', city:'Pohang', keywords:['ARPES','Correlated'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-baumberger-epfl', name:'Baumberger Group', englishName:'Baumberger Group', country:'Switzerland', city:'Lausanne', keywords:['ARPES','2D Materials'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-claessen-wuerzburg', name:'Claessen Group', englishName:'Claessen Group', country:'Germany', city:'Wuerzburg', keywords:['ARPES','Correlated'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-borisenko-dresden', name:'Borisenko Group', englishName:'Borisenko Group', country:'Germany', city:'Dresden', keywords:['ARPES','Iron-Based'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-valla-brookhaven', name:'Valla Group', englishName:'Valla Group', country:'USA', city:'Brookhaven', keywords:['ARPES','Superconductor'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-chen-ustc', name:'Chen ARPES Group', englishName:'Chen ARPES Group', country:'China', city:'合肥', keywords:['ARPES','Superconductor'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-xue-tsinghua', name:'Xue Group', englishName:'Xue Group', country:'China', city:'北京', keywords:['MBE','ARPES','Topological'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-wang-pku', name:'Wang Group', englishName:'Wang Group', country:'China', city:'北京', keywords:['ARPES','2D Materials'], currentStatus:'Active'});
CREATE (:Lab {uuid:'lab-sustech-arpes', name:'SUSTech ARPES Group', englishName:'SUSTech ARPES Group', country:'China', city:'深圳', keywords:['ARPES','Quantum Materials'], currentStatus:'Active'});

// === 导师链关联 ===
MATCH (p:Person {uuid:'person-zx-shen'}), (l:Lab {uuid:'lab-shen-arpes'}) MERGE (p)-[:MEMBER_OF]->(l);
MATCH (p:Person {uuid:'person-feng-dl'}), (l:Lab {uuid:'lab-feng-fudan'}) MERGE (p)-[:MEMBER_OF]->(l);
MATCH (p:Person {uuid:'person-zhou-xj'}), (l:Lab {uuid:'lab-zhou-cas'}) MERGE (p)-[:MEMBER_OF]->(l);
MATCH (p:Person {uuid:'person-ding-h'}), (l:Lab {uuid:'lab-ding-cas'}) MERGE (p)-[:MEMBER_OF]->(l);

// === 学生关系 ===
MATCH (a:Person {uuid:'person-feng-dl'}), (s:Person {uuid:'person-qian-t'}) MERGE (a)-[:ADVISOR_OF {confidence:0.9}]->(s);
MATCH (a:Person {uuid:'person-damascelli'}), (s:Person {uuid:'person-sobral'}) MERGE (a)-[:ADVISOR_OF]->(s);

// === 同学关系（同一导师的学生） ===
MATCH (a:Person {uuid:'person-feng-dl'}), (b:Person {uuid:'person-wang-sc'}) MERGE (a)-[:COAUTHOR_WITH {confidence:0.8}]->(b);
MATCH (a:Person {uuid:'person-feng-dl'}), (b:Person {uuid:'person-zhang-wt'}) MERGE (a)-[:COAUTHOR_WITH {confidence:0.8}]->(b);
MATCH (a:Person {uuid:'person-wang-sc'}), (b:Person {uuid:'person-he-y'}) MERGE (a)-[:COAUTHOR_WITH {confidence:0.8}]->(b);
MATCH (a:Person {uuid:'person-zhao-l'}), (b:Person {uuid:'person-zhou-xj'}) MERGE (b)-[:ADVISOR_OF]->(a);

// === 全球大学 ===
CREATE (:University {uuid:'univ-tohoku', englishName:'Tohoku University', chineseName:'东北大学', country:'Japan', city:'Sendai'});
CREATE (:University {uuid:'univ-postech', englishName:'POSTECH', chineseName:'浦项工科大学', country:'Korea', city:'Pohang'});
CREATE (:University {uuid:'univ-epfl', englishName:'EPFL', chineseName:'洛桑联邦理工', country:'Switzerland', city:'Lausanne'});
CREATE (:University {uuid:'univ-wuerzburg', englishName:'Wuerzburg University', chineseName:'维尔茨堡大学', country:'Germany', city:'Wuerzburg'});
CREATE (:University {uuid:'univ-brookhaven', englishName:'Brookhaven National Lab', chineseName:'布鲁克海文国家实验室', country:'USA', city:'Upton'});
CREATE (:University {uuid:'univ-tsinghua', englishName:'Tsinghua University', chineseName:'清华大学', country:'China', city:'北京'});
CREATE (:University {uuid:'univ-pku', englishName:'Peking University', chineseName:'北京大学', country:'China', city:'北京'});
CREATE (:University {uuid:'univ-sustech', englishName:'SUSTech', chineseName:'南方科技大学', country:'China', city:'深圳'});
CREATE (:University {uuid:'univ-zju', englishName:'Zhejiang University', chineseName:'浙江大学', country:'China', city:'杭州'});

// === 实验室→大学 ===
MATCH (l:Lab {uuid:'lab-takahashi-tohoku'}), (u:University {uuid:'univ-tohoku'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-kim-postech'}), (u:University {uuid:'univ-postech'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-baumberger-epfl'}), (u:University {uuid:'univ-epfl'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-claessen-wuerzburg'}), (u:University {uuid:'univ-wuerzburg'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-borisenko-dresden'}), (u:University {uuid:'univ-wuerzburg'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-valla-brookhaven'}), (u:University {uuid:'univ-brookhaven'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-chen-ustc'}), (u:University {uuid:'univ-ustc'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-xue-tsinghua'}), (u:University {uuid:'univ-tsinghua'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-wang-pku'}), (u:University {uuid:'univ-pku'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-sustech-arpes'}), (u:University {uuid:'univ-sustech'}) MERGE (l)-[:BELONGS_TO]->(u);
MATCH (l:Lab {uuid:'lab-ding-cas'}), (u:University {uuid:'univ-cas-iop'}) MERGE (l)-[:BELONGS_TO]->(u);

RETURN 'Genealogy and global labs seeded' AS result;
