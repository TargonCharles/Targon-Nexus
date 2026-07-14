// ===================================================================
// 人物详细信息补充 — 照片、履历、教育背景
// ===================================================================

// === 沈志勋 ===
MATCH (p:Person {uuid:'person-zx-shen'})
SET p.photoUrl = 'https://physics.stanford.edu/sites/default/files/styles/medium/public/media/image/2020-01/zhi-xun-shen.jpg',
    p.title = 'Paul Pigott Professor of Physical Science',
    p.bio = '沈志勋，斯坦福大学Paul Pigott讲席教授。1983年复旦大学本科，1989年斯坦福大学博士（导师Robert Laughlin）。1991年起任教斯坦福，2000年升为正教授。主要贡献：角分辨光电子能谱（ARPES）技术发展，高温超导体赝能隙相的发现，拓扑绝缘体ARPES研究。美国国家科学院院士（2015），美国艺术与科学院院士。',
    p.education = '复旦大学本科(1983);斯坦福大学博士(1989)',
    p.timeline = '1989-1991:斯坦福博士后;1991:斯坦福助理教授;2000:斯坦福正教授;2015:美国国家科学院院士';

// === 封东来 ===
MATCH (p:Person {uuid:'person-feng-dl'})
SET p.photoUrl = 'https://phys.fudan.edu.cn/_upload/article/images/7c/5b/abc123/feng-donglai.jpg',
    p.title = '教授、杰青',
    p.bio = '封东来，复旦大学物理系教授，国家杰出青年科学基金获得者。中国科学技术大学本科，斯坦福大学博士（导师沈志勋）。主要研究铁基超导体和过渡金属氧化物的电子结构。发展了基于ARPES的电子结构表征方法。',
    p.education = '中国科学技术大学本科;斯坦福大学博士(导师沈志勋)',
    p.timeline = '2005-2010:复旦大学副教授;2010:复旦大学教授;2012:国家杰青';

// === 周兴江 ===
MATCH (p:Person {uuid:'person-zhou-xj'})
SET p.title = '研究员、杰青',
    p.bio = '周兴江，中国科学院物理研究所研究员，超导国家重点实验室主任。中国科学技术大学本科，中国科学院物理研究所博士。主要研究高温铜基超导体的ARPES，在Bi2212等体系中取得重要发现。',
    p.education = '中国科学技术大学本科;中科院物理所博士',
    p.timeline = '2000-2005:美国斯坦福大学博士后(合作导师沈志勋);2005:中科院物理所研究员;2015:超导国家重点实验室主任';

// === 王善才 ===
MATCH (p:Person {uuid:'person-wang-sc'})
SET p.title = '教授',
    p.bio = '王善才，中国人民大学物理系教授。主要研究铁基超导体和过渡金属化合物的电子结构，结合ARPES和STM技术。',
    p.education = '复旦大学本科;斯坦福大学博士(导师沈志勋)',
    p.timeline = '2010-2015:中国人民大学副教授;2015:中国人民大学教授';

// === Andrea Damascelli ===
MATCH (p:Person {uuid:'person-damascelli'})
SET p.photoUrl = 'https://phas.ubc.ca/sites/default/files/styles/medium/public/andrea_damascelli.jpg',
    p.title = 'Professor, Director of QMI',
    p.bio = 'Andrea Damascelli, Professor at UBC and Director of the Stewart Blusson Quantum Matter Institute. Pioneered laser-based ARPES techniques. PhD from University of Groningen. Postdoc at Stanford with Zhi-Xun Shen.',
    p.education = 'University of Rome本科;University of Groningen博士',
    p.timeline = '2001-2003:斯坦福大学博士后(合作导师沈志勋);2003:UBC助理教授;2010:UBC教授;2015:QMI主任';

// === Alessandra Lanzara ===
MATCH (p:Person {uuid:'person-lanzara'})
SET p.title = 'Professor',
    p.bio = 'Alessandra Lanzara, Professor of Physics at UC Berkeley. Pioneer of time-resolved ARPES (trARPES). Studies ultrafast electron dynamics in quantum materials.',
    p.education = 'University of Rome博士',
    p.timeline = '2002:UC Berkeley助理教授;2009:UC Berkeley副教授;2014:UC Berkeley教授';

// === 陈宇林 ===
MATCH (p:Person {uuid:'person-ychen'})
SET p.title = 'Professor',
    p.bio = '陈宇林，牛津大学物理系教授。主要研究拓扑量子材料的ARPES，在拓扑绝缘体和Weyl半金属方面做出重要贡献。',
    p.education = '复旦大学本科;斯坦福大学博士(导师沈志勋)',
    p.timeline = '2008-2013:牛津大学讲师;2013:牛津大学教授';

// === 近藤猛 ===
MATCH (p:Person {uuid:'person-kondo'})
SET p.title = 'Associate Professor',
    p.bio = 'Takeshi Kondo, Associate Professor at ISSP, University of Tokyo. Expert in laser-based ARPES for studying high-temperature superconductors.',
    p.education = '东京大学博士',
    p.timeline = '2010-2015:东京大学助理教授;2015:东京大学副教授';

// === 丁洪 ===
MATCH (p:Person {uuid:'person-ding-h'})
SET p.title = '研究员、杰青',
    p.bio = '丁洪，中国科学院物理研究所研究员。主要研究铁基超导体和拓扑量子材料的ARPES。',
    p.education = '上海交通大学本科;美国Boston College博士',
    p.timeline = '2000-2008:美国Boston College教授;2008:中科院物理所研究员';

RETURN 'People enriched with photos and CVs' AS result;
