// ===================================================================
// v1.0 通用科研分类体系 — 覆盖多个科学领域
// ===================================================================

// === 领域 Taxonomy ===
CREATE (:ResearchDirection {uuid:'field-condensed-matter', name:'凝聚态物理', englishName:'Condensed Matter Physics', level:0, description:'凝聚态理论和实验'});
CREATE (:ResearchDirection {uuid:'field-materials', name:'材料科学', englishName:'Materials Science', level:0, description:'材料合成、表征与应用'});
CREATE (:ResearchDirection {uuid:'field-chemistry', name:'化学', englishName:'Chemistry', level:0, description:'物理化学、无机化学、有机化学'});
CREATE (:ResearchDirection {uuid:'field-optics', name:'光学与光子学', englishName:'Optics & Photonics', level:0, description:'激光、非线性光学、量子光学'});
CREATE (:ResearchDirection {uuid:'field-nano', name:'纳米科学', englishName:'Nanoscience', level:0, description:'纳米材料、纳米器件'});
CREATE (:ResearchDirection {uuid:'field-bio', name:'生物物理', englishName:'Biophysics', level:0, description:'结构生物学、膜蛋白'});
CREATE (:ResearchDirection {uuid:'field-computation', name:'计算科学', englishName:'Computational Science', level:0, description:'DFT、分子动力学、机器学习'});

// === 工艺/技术（Techniques）===
CREATE (:ResearchDirection {uuid:'tech-arpes', name:'ARPES', englishName:'ARPES', level:1, description:'角分辨光电子能谱'});
CREATE (:ResearchDirection {uuid:'tech-xps', name:'XPS', englishName:'XPS', level:1, description:'X射线光电子能谱'});
CREATE (:ResearchDirection {uuid:'tech-xrd', name:'XRD', englishName:'XRD', level:1, description:'X射线衍射'});
CREATE (:ResearchDirection {uuid:'tech-tem', name:'TEM', englishName:'TEM', level:1, description:'透射电子显微镜'});
CREATE (:ResearchDirection {uuid:'tech-stm', name:'STM/STS', englishName:'STM/STS', level:1, description:'扫描隧道显微镜/谱'});
CREATE (:ResearchDirection {uuid:'tech-mbe', name:'MBE', englishName:'MBE', level:1, description:'分子束外延'});
CREATE (:ResearchDirection {uuid:'tech-cvd', name:'CVD', englishName:'CVD', level:1, description:'化学气相沉积'});
CREATE (:ResearchDirection {uuid:'tech-nmr', name:'NMR', englishName:'NMR', level:1, description:'核磁共振'});
CREATE (:ResearchDirection {uuid:'tech-neutron', name:'中子散射', englishName:'Neutron Scattering', level:1, description:'非弹性中子散射'});
CREATE (:ResearchDirection {uuid:'tech-cryoem', name:'冷冻电镜', englishName:'Cryo-EM', level:1, description:'冷冻电子显微镜'});
CREATE (:ResearchDirection {uuid:'tech-raman', name:'拉曼光谱', englishName:'Raman Spectroscopy', level:1, description:'拉曼散射光谱'});
CREATE (:ResearchDirection {uuid:'tech-afm', name:'AFM', englishName:'AFM', level:1, description:'原子力显微镜'});

// === 课题/方向 ===
CREATE (:ResearchDirection {uuid:'topic-superconductor', name:'超导材料', englishName:'Superconductors', level:2});
CREATE (:ResearchDirection {uuid:'topic-topological', name:'拓扑量子材料', englishName:'Topological Materials', level:2});
CREATE (:ResearchDirection {uuid:'topic-2d', name:'二维材料', englishName:'2D Materials', level:2});
CREATE (:ResearchDirection {uuid:'topic-correlated', name:'强关联体系', englishName:'Correlated Systems', level:2});
CREATE (:ResearchDirection {uuid:'topic-magnetism', name:'磁性材料', englishName:'Magnetic Materials', level:2});
CREATE (:ResearchDirection {uuid:'topic-perovskite', name:'钙钛矿材料', englishName:'Perovskite Materials', level:2});
CREATE (:ResearchDirection {uuid:'topic-battery', name:'电池材料', englishName:'Battery Materials', level:2});
CREATE (:ResearchDirection {uuid:'topic-catalysis', name:'催化材料', englishName:'Catalysis', level:2});
CREATE (:ResearchDirection {uuid:'topic-photovoltaic', name:'光伏材料', englishName:'Photovoltaics', level:2});
CREATE (:ResearchDirection {uuid:'topic-thermoelectric', name:'热电材料', englishName:'Thermoelectrics', level:2});
CREATE (:ResearchDirection {uuid:'topic-organic', name:'有机电子学', englishName:'Organic Electronics', level:2});
CREATE (:ResearchDirection {uuid:'topic-spintronics', name:'自旋电子学', englishName:'Spintronics', level:2});
CREATE (:ResearchDirection {uuid:'topic-quantum-comp', name:'量子计算', englishName:'Quantum Computing', level:2});
CREATE (:ResearchDirection {uuid:'topic-metamaterials', name:'超材料', englishName:'Metamaterials', level:2});
CREATE (:ResearchDirection {uuid:'topic-phononics', name:'声子学', englishName:'Phononics', level:2});

// === 全球机构 ===
CREATE (:University {uuid:'univ-mit', englishName:'MIT', chineseName:'麻省理工学院', country:'USA', city:'Cambridge'});
CREATE (:University {uuid:'univ-harvard', englishName:'Harvard University', chineseName:'哈佛大学', country:'USA', city:'Cambridge'});
CREATE (:University {uuid:'univ-cambridge', englishName:'University of Cambridge', chineseName:'剑桥大学', country:'UK', city:'Cambridge'});
CREATE (:University {uuid:'univ-eth', englishName:'ETH Zurich', chineseName:'苏黎世联邦理工', country:'Switzerland', city:'Zurich'});
CREATE (:University {uuid:'univ-mpg', englishName:'Max Planck Institute', chineseName:'马普所', country:'Germany', city:'Stuttgart'});
CREATE (:University {uuid:'univ-nus', englishName:'National University of Singapore', chineseName:'新加坡国立大学', country:'Singapore', city:'Singapore'});
CREATE (:University {uuid:'univ-kaist', englishName:'KAIST', chineseName:'韩国科学技术院', country:'Korea', city:'Daejeon'});
CREATE (:University {uuid:'univ-iisc', englishName:'Indian Institute of Science', chineseName:'印度科学学院', country:'India', city:'Bangalore'});

// === 通用设备 ===
CREATE (:Equipment {uuid:'eq-xps-system', name:'XPS系统', category:'Spectroscopy', description:'X射线光电子能谱仪'});
CREATE (:Equipment {uuid:'eq-xrd-rigaku', name:'Rigaku SmartLab XRD', brand:'Rigaku', category:'XRD', description:'高分辨X射线衍射仪'});
CREATE (:Equipment {uuid:'eq-tem-jeol', name:'JEOL F200 TEM', brand:'JEOL', category:'TEM', description:'场发射透射电镜'});
CREATE (:Equipment {uuid:'eq-cvd-system', name:'CVD系统', category:'Synthesis', description:'化学气相沉积系统'});
CREATE (:Equipment {uuid:'eq-raman-horiba', name:'Horiba LabRAM HR', brand:'Horiba', category:'Spectroscopy', description:'高分辨拉曼光谱仪'});
CREATE (:Equipment {uuid:'eq-ppms-qd', name:'Quantum Design PPMS', brand:'Quantum Design', category:'Measurement', description:'综合物性测量系统'});
CREATE (:Equipment {uuid:'eq-squid', name:'SQUID磁强计', brand:'Quantum Design', category:'Measurement', description:'超导量子干涉仪'});
CREATE (:Equipment {uuid:'eq-nmr-bruker', name:'Bruker AVANCE NMR', brand:'Bruker', category:'Spectroscopy', description:'核磁共振波谱仪'});
CREATE (:Equipment {uuid:'eq-cryo-titan', name:'Titan Krios Cryo-EM', brand:'Thermo Fisher', category:'Microscopy', description:'冷冻透射电镜'});
CREATE (:Equipment {uuid:'eq-afm-bruker', name:'Bruker Dimension Icon', brand:'Bruker', category:'Microscopy', description:'原子力显微镜'});

RETURN 'v1.0 taxonomy seeded' AS result;
