# Targon Nexus — 数据采集与知识图谱构建策略

---

## 1. 项目目标与数据原则

**系统定位**：构建高可信科研/工业关系知识图谱，而不是普通 CRM 或搜索引擎。

**核心原则**：
- **Accuracy First**：宁可返回"暂无数据"，也不返回错误数据。每一条关系必须有据可查
- **Evidence Based**：AI 不相信自己，只相信证据。所有事实必须绑定到可追溯的原始来源
- **Graph Native**：Neo4j 是唯一数据真相源。关系是一等公民，不是附属属性
- **Continuous Improvement**：图谱永不停机，每次爬取、每次人工修正都在持续优化数据质量

**数据准入标准**（进入 Production Graph 的硬门槛）：
| 数据类型 | 最低置信度 | 最低证据数 | 审核要求 |
|---------|-----------|-----------|---------|
| 人物基本信息 | 0.7 | 1 | 自动发布 |
| 机构归属 | 0.8 | 1 | 自动发布 |
| 导师-学生关系 | 0.8 | 2 | 置信度 < 0.8 需人工审核 |
| 合作关系 | 0.6 | 1 | 自动发布 |
| 设备归属 | 0.7 | 1 | 自动发布 |
| 引用关系 | 0.95 | 1 | 自动发布（来自 CrossRef/Semantic Scholar） |

---

## 2. 数据源体系设计

### Tier 0：官方事实源（最高优先级，置信度 ≥ 0.9）

| 数据源 | 获取内容 | 获取方式 | 字段映射 | 可信度权重 |
|--------|---------|---------|---------|-----------|
| **大学/机构官网** | 教授列表、职位、履历 | Playwright 爬虫 | `position`→Person.title, `department`→AFFILIATED_WITH | 0.95 |
| **实验室主页** | 成员列表、研究方向、设备清单 | Playwright 爬虫 | `members`→MEMBER_OF, `equipment`→HAS_EQUIPMENT | 0.95 |
| **个人学术主页** | CV、教育背景、论文列表 | Playwright 爬虫 | `education`→EducationEntry, `papers`→PUBLISHED | 0.90 |
| **博士论文数据库** (ProQuest/PQDT) | 学生姓名、导师姓名、学位年份 | API + 爬虫 | `student/advisor`→ADVISOR_OF, `year`→startYear | 0.95 |

### Tier 1：科研身份源（高优先级，置信度 0.80-0.95）

| 数据源 | 获取内容 | 获取方式 | 字段映射 | 可信度权重 |
|--------|---------|---------|---------|-----------|
| **ORCID** | 研究者唯一 ID、教育经历、工作经历 | 公开 REST API | `orcid`→Person.orcid, `education`→EducationEntry[] | 0.95 |
| **OpenAlex** | 论文元数据、作者、引用关系 | 免费 API | `authors`→AUTHORED_BY, `citations`→CITES | 0.90 |
| **Semantic Scholar** | 论文引用网络、引用计数 | 免费 API | `citationCount`→Paper.citationCount, `references`→CITES | 0.90 |
| **CrossRef** | DOI 元数据、作者、期刊信息 | 免费 API | `doi`→Paper.doi, `journal`→Paper.journal | 0.95 |
| **arXiv** | 预印本、作者、分类 | 免费 API | `authors`→AUTHORED_BY, `category`→ResearchDirection | 0.85 |

### Tier 2：辅助源（中等优先级，置信度 0.50-0.80）

| 数据源 | 获取内容 | 获取方式 | 可信度权重 | 用途 |
|--------|---------|---------|-----------|------|
| **Google Scholar** | 论文列表、引用数、h-index、合作者 | Playwright 爬虫 | 0.70 | 验证 Tier 0/1 数据，补充引用计数 |
| **ResearchGate** | 论文全文、研究兴趣、项目 | Playwright 爬虫 | 0.60 | 补充研究兴趣和合作者 |
| **LinkedIn** | 教育经历、职业经历 | Playwright 爬虫 | 0.60 | Career Path 推断辅助 |
| **会议页面** (APS March Meeting 等) | 参会者、报告题目、机构 | Playwright 爬虫 | 0.50 | 补充合作关系和最新研究动态 |
| **Wikipedia** | 研究者传记、机构历史 | Playwright 爬虫 | 0.65 | 补充背景信息 |

---

## 3. 数据采集系统 Data Acquisition Pipeline

### 3.1 完整采集流程

```
关键词输入 → AI Query Expansion → 目标机构发现 → 实验室发现
    → 页面爬取 → 文档解析 → 信息抽取 → 待验证知识
    → 消歧 → 事实提取 → Evidence 绑定 → Knowledge Graph
```

### 3.2 各阶段详细设计

#### Stage 1: Discovery Agent（发现阶段）

**输入**：领域关键词（如 "ARPES", "topological insulator"）
**AI Query Expansion**：LLM 自动扩展相关术语、设备名、研究方向和实验方法
**输出**：目标 URL 列表（机构页面、实验室页面、个人主页）

```
关键词: "ARPES"
    → AI 扩展: "angle-resolved photoemission", "electronic structure",
               "Scienta DA30", "Fermi surface mapping",
               "strongly correlated systems"
    → 搜索: arXiv, Google Scholar, 大学目录
    → 发现: 目标机构列表 + 实验室列表 + 研究者列表
```

#### Stage 2: Crawler Agent（爬取阶段）

- **Web Crawler**: Playwright + Crawlee, headless Chromium
- **速率控制**: 每域名 1 req/s, robots.txt 遵守, 3 次重试+指数退避
- **内容类型**: HTML（渲染后 DOM）、PDF（SHA-256 哈希去重）
- **变化检测**: 归一化正文 SHA-256 比对, 无变化则跳过

#### Stage 3: Document Parser（解析阶段）

- **HTML → Markdown**: 保留结构（标题、表格、列表）
- **PDF → Text**: pdfplumber + Tesseract OCR (扫描件)
- **语言检测**: fastText 中/英/日/韩/德/法

#### Stage 4: Web Monitor（变化监控）

- 对已知 URL 建立监控任务
- 按重要性分级：实验室主页每日检查, 机构页面每周检查
- 变化时触发增量更新 Pipeline

---

## 4. 领域关键词扩展与目标发现机制

### 4.1 Topic Ontology（领域本体）

建立分层领域本体，从技术方向反向发现实验室、机构、人员：

```
凝聚态物理
├── 电子结构
│   ├── ARPES
│   │   ├── 激光 ARPES
│   │   ├── 自旋分辨 ARPES
│   │   ├── 时间分辨 ARPES (trARPES)
│   │   └── 纳米 ARPES
│   ├── 费米面谱
│   └── 能带计算
├── 拓扑量子材料
│   ├── 拓扑绝缘体
│   ├── Weyl/Dirac 半金属
│   └── 拓扑超导体
└── 强关联体系
    ├── 高温超导
    ├── 重费米子
    ├── 电荷密度波
    └── Kagome 金属
```

### 4.2 发现规则

1. **技术方向 → 设备**: "ARPES" → "Scienta DA30", "Scienta R4000", "SPECS Phoibos"
2. **设备 → 实验室**: "DA30" → 拥有该设备的实验室
3. **实验室 → 人员**: 实验室成员列表 → 教授/PI/学生
4. **人员 → 论文**: 通过 ORCID/Google Scholar 查询论文列表

---

## 5. 实体识别 Entity Extraction

### 5.1 LLM + Few-shot Prompt + Rule Engine

**策略**：LLM 优先；LLM 不可用时退回到正则启公式（邮件→Person，URL→机构等）

**支持的实体类型**：

| 实体类型 | 识别来源 | 必需字段 | 可选字段 |
|---------|---------|---------|---------|
| Person | 实验室页面、论文作者列表、ORCID | name, englishName | chineseName, email, orcid, title |
| Organization | 机构页面、隶属关系 | name, englishName, country | city, website, type |
| Research Lab | 实验室主页、机构子页面 | name, englishName, institution | abbreviation, pi, members |
| Equipment | 设备清单、论文方法章节 | name, category, brand, model | lab, installationYear |
| Research Topic | 论文关键词、实验室研究方向 | name | description, parentTopic |
| Paper | 论文数据库、Google Scholar | doi, title, authors | year, journal, citationCount |

### 5.2 输出格式

```json
{
  "entities": [
    {
      "name": "Zhi-Xun Shen",
      "chineseName": "沈志勋",
      "type": "Person",
      "orcid": "0000-0001-8765-4321",
      "affiliation": "Stanford University",
      "confidence": 0.95,
      "sourceUrl": "https://profiles.stanford.edu/zxshen"
    }
  ],
  "relationships": [
    {
      "sourceEntityName": "Zhi-Xun Shen",
      "targetEntityName": "Stanford University",
      "type": "WORKS_AT",
      "confidence": 0.95,
      "evidence": "Stanford Physics Department faculty page lists Prof. Shen"
    }
  ]
}
```

### 5.3 Schema Validation

所有 LLM 输出必须通过 JSON Schema 校验。禁止无约束 LLM 输出。字段类型不匹配、缺少必需字段、实体类型不在枚举范围内的条目被自动丢弃并记录日志。

---

## 6. 实体标准化与身份消歧 Entity Resolution

### 6.1 多级匹配机制

**Tier 1: 精确标识符匹配 (置信度 ≥ 0.95)**
- ORCID 精确匹配 → 置信度 0.99
- Email 精确匹配（同域名） → 置信度 0.95
- Google Scholar ID 匹配 → 置信度 0.95
- ROR ID 匹配（机构） → 置信度 0.99

**Tier 2: 姓名 + 机构 + 研究方向匹配 (置信度 0.75-0.90)**
- 姓名 Token Sort Ratio ≥ 0.85 + 机构重叠 → 置信度 0.85
- 姓名匹配 + 研究兴趣重叠 > 70% → 置信度 0.80

**Tier 3: LLM 语义判断 (置信度 0.60-0.85)**
- 提供完整人物 Profile 给 LLM（教育经历、论文列表、合作者网络）
- 输出：`{same_person: bool, confidence: 0-1, reasoning: "..."}`

**Tier 4: Career Graph Matching (置信度 0.70-0.90)**
- 比较两个人的教育经历链、导师关系、论文轨迹、职业路径
- 如果轨迹相似度 > 80% → 可能是同一人

### 6.2 特殊场景

- **同名教授**: 同一机构 + 同一领域 + 同名 → 必须通过 ORCID 或论文列表区分
- **多语言姓名**: 中文名 "封东来" = 英文 "Donglai Feng" = 拼音 "Feng Donglai" = 简称 "D.L. Feng" → 统一存储，所有变体放入 `aliases`
- **机构变化**: 同一研究者在不同时期的机构归属通过日期范围区分

---

## 7. 事实层 Fact Model

不直接存储关系，而是建立 Fact 层。每一个知识点必须成为独立的可验证事实：

### 7.1 Fact 结构

```
Fact {
  uuid: "fact-xxx",
  subject: "John Smith",        // 主体
  predicate: "WORKS_AT",        // 谓词
  object: "MIT",                // 客体
  confidence: 0.95,             // 置信度
  evidence: [                   // 证据链
    { sourceUrl: "...", excerpt: "...", collectedAt: "..." }
  ],
  status: "verified" | "candidate" | "expired" | "conflict" | "rejected",
  createdAt: "2024-01-15T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z"
}
```

### 7.2 示例

```
Fact 1: { subject: "Zhi-Xun Shen", predicate: "WORKS_AT", object: "Stanford University",
          confidence: 0.95, status: "verified",
          evidence: [{sourceUrl: "https://profiles.stanford.edu/zxshen"}] }

Fact 2: { subject: "Zhi-Xun Shen", predicate: "ADVISOR_OF", object: "Donglai Feng",
          confidence: 0.95, status: "verified",
          evidence: [{sourceUrl: "https://..."}, {sourceUrl: "https://..."}] }

Fact 3: { subject: "Donglai Feng", predicate: "WORKS_AT", object: "Fudan University",
          confidence: 0.90, status: "verified",
          evidence: [{sourceUrl: "https://phys.fudan.edu.cn/fengdl"}] }
```

### 7.3 Fact 生命周周

```
Candidate → Verification → Verified
                              ↓ (time passes)
                           Expired → Re-verify → Verified / Rejected
Verified → Conflict Detected → Conflict → Resolution → Verified / Rejected
```

---

## 8. 证据体系 Evidence Management

### 8.1 Evidence Store 设计

**存储内容**：

| 证据类型 | 存储位置 | 保留策略 |
|---------|---------|---------|
| 网页 HTML 快照 | MinIO/S3 | 永久保留（谱系证据） |
| PDF 文档 | MinIO/S3 | 永久保留 |
| 文本片段 (excerpt) | Neo4j Evidence 节点 | 永久保留 |
| 来源 URL | Neo4j Evidence 节点 | 永久保留 |
| 爬取时间戳 | Neo4j Evidence 节点 | 永久保留 |
| 截图 | MinIO/S3 | 90天 |

### 8.2 AI 自我约束原则

> "AI 不相信自己，只相信证据"

- 任何人物关系、师生关系、设备关系**必须能够回溯到原始证据**
- LLM 提取的结果标记为 `source: "llm_extraction"`，置信度上限 0.85
- 人工标注的结果标记为 `source: "manual"`，置信度 1.0
- 无证据的推断结果**不入库**，记录到待验证队列

### 8.3 Evidence Node 结构

```cypher
(:Evidence {
  uuid: "ev-xxx",
  sourceUrl: "https://profiles.stanford.edu/zxshen",
  excerpt: "Prof. Shen's research group includes 15 PhD students...",
  evidenceType: "web_page",
  collectedAt: datetime(),
  contentHash: "sha256-xxx",
  screenshotPath: "s3://evidence/screenshots/xxx.png"
})
```

---

## 9. 关系抽取 Relationship Extraction

### 9.1 关系类型体系

**学术关系**：

| 关系类型 | 方向 | 数据来源 | 必需证据 |
|---------|------|---------|---------|
| ADVISOR_OF | (advisor)→(student) | 实验室 Alumni 页面、博士论文、CV、AcademicTree | ≥ 2 来源或 1 个官方来源 |
| COAUTHOR_WITH | (person)↔(person) | 论文共同作者 | 论文 DOI |
| STUDENT_OF | (student)→(advisor) | 同 ADVISOR_OF 反向 | 同上 |

**组织关系**：

| 关系类型 | 方向 | 数据来源 | 必需证据 |
|---------|------|---------|---------|
| MEMBER_OF | (person)→(lab) | 实验室 People 页面 | 网页 URL |
| ALUMNI_OF | (person)→(lab) | 实验室 Alumni 页面 | 网页 URL |
| WORKS_AT | (person)→(institution) | 官网教职名录、ORCID | 网页或 ORCID |
| BELONGS_TO | (lab)→(institution) | 实验室网站、机构网站 | 网页 URL |

**资源关系**：

| 关系类型 | 方向 | 数据来源 | 必需证据 |
|---------|------|---------|---------|
| HAS_EQUIPMENT | (lab)→(equipment) | 设备清单、论文方法章节 | 网页或论文 |
| PUBLISHED | (person)→(paper) | 论文作者列表 | 论文 DOI |
| CITES | (paper)→(paper) | CrossRef / Semantic Scholar | 论文 DOI 对 |

### 9.2 提取流程

```
1. 从实验室网页提取成员列表 → 生成 MEMBER_OF 关系
2. 从实验室 Alumni 页面提取毕业生 → 生成 ALUMNI_OF + ADVISOR_OF 推断
3. 从论文数据库提取作者 → 生成 AUTHORED_BY 关系
4. 从 CV / 博士论文提取导师信息 → 生成 ADVISOR_OF 关系
5. 从设备清单提取设备 → 生成 HAS_EQUIPMENT 关系
6. 每条关系必须绑定至少 1 条 Evidence
```

---

## 10. 学术家谱 Academic Genealogy Engine

### 10.1 为什么这是核心模块

学术家谱是理解科研社区权力结构、知识传承和人才流动的骨架。没有它，知识图谱只是孤立节点的集合。

- 家谱关系是**最稳定**的关系——导师关系不会随跳槽而改变
- 家谱是发现**人才流动**的关键——学生去了哪、新实验室从哪里来
- 家谱是理解**学派传承**的唯一途径——谁传承了谁的方法论和研究方向

### 10.2 数据来源优先级

| 优先级 | 数据源 | 内容 | 获取方式 | 可倍度 |
|--------|--------|------|---------|--------|
| P0 | 实验室 Alumni 页面 | 毕业生名单（姓名、学位、年份、去向） | Playwright 爬虫 | 0.95 |
| P0 | 博士论文数据库 (ProQuest/PQDT) | 学生、导师、论文标题、年份 | API | 0.95 |
| P1 | AcademicTree.org | 结构化学术家谱 | 爬虫 | 0.90 |
| P1 | Mathematics Genealogy Project | 数学/理论物理家谱 | 爬虫 | 0.90 |
| P1 | 个人 CV / 主页 | 教育背景、导师姓名 | Playwright | 0.85 |
| P2 | 论文致谢 | "I thank my PhD advisor Prof. X..." | NLP 提取 | 0.80 |
| P3 | 论文合作模式推断 | 资深+新手持续合作 ≥ 3 篇 | 数据分析 | 0.50 |

### 10.3 Current Members 采集

```cypher
// 实验室现成员的建模
(person)-[:MEMBER_OF {
  role: 'pi' | 'co_pi' | 'postdoc' | 'phd_student' | 'staff',
  startYear: 2020,
  endYear: null,          // null = 当前仍在
  confidence: 0.95
}]->(lab)
```

### 10.4 Former Members 采集

```cypher
// 实验室前成员的建模
(person)-[:ALUMNI_OF {
  role: 'phd_student',
  startYear: 2010,
  endYear: 2015,
  currentPosition: 'Professor',
  currentInstitution: 'Fudan University',
  confidence: 0.95
}]->(lab)
```

### 10.5 Student Migration 追踪

追踪学生的流动路径：某教授的学生去了哪些机构，形成了怎样的下一代实验室。

```
查询: "谁的学生现在已成独立 PI？"
Cypher:
  MATCH (prof:Person)-[:ADVISOR_OF]->(student:Person)-[:MEMBER_OF {role:'pi'}]->(lab:Lab)
  RETURN prof.englishName, student.englishName, lab.name
```

### 10.6 Academic Lineage 展示

```
沈志勋 (Stanford)
  ├── 封东来 (Fudan) ─── 钱嘉陵 (Zhejiang) ─── 张鹏 (Wuhan)
  │     └── 钱天 (Fudan)
  ├── 陈宇林 (Tsinghua/Oxford)
  ├── Alessandra Lanzara (Berkeley) ─── Luca Moreschini
  ├── Kyle Shen (Cornell)
  ├── Riccardo Comin (MIT)
  └── Donghui Lu (SSRL)
```

### 10.7 禁止事项

- 禁止 A→B→C→A 循环引用
- 禁止 solo AI 推断（必须至少一条人工可查证的证据）
- 禁止覆盖手动标注的关系
- 禁止创建无时间轴的导师关系

---

## 11. 职业轨迹 Career Path Graph

### 11.1 个人生命周期模型

```
本预 → 硕士 → 博士 → 博士后 → 助理教授 → 副教授 → 正教授 → 荣休
                              ↓
                          企业研发 / 国家实验室 / 创业
```

### 11.2 Career Path 建模

```cypher
// 每个人物的职业生涯时间线
(p:Person)-[:HAS_CAREER_EVENT]->(:CareerEvent {
  type: 'graduation' | 'appointment' | 'promotion' | 'departure',
  institution: 'Stanford University',
  position: 'PhD Student',
  startDate: '1998-09-01',
  endDate: '2004-06-01',
  advisor: 'Robert Laughlin',       // 如果是学生阶段
  confidence: 0.95
})
```

### 11.3 用途

1. **身份消歧**：两人的 Career Path 重叠度 > 80% → 可能是同一人
2. **人才发现**：追踪某教授的学生去了哪些公司/机构
3. **行业分析**：某个技术方向的博士毕业去向分布

---

## 12. 设备与实验室关系模型 Equipment Intelligence Graph

### 12.1 Equipment Node

```cypher
(:Equipment {
  uuid: "eq-scienta-da30-001",
  name: "Scienta DA30 ARPES System",
  category: "ARPES",
  brand: "Scienta Omicron",
  model: "DA30",
  manufacturer: "Scienta Omicron AB",
  specifications: {
    energyResolution: "<1 meV",
    angularResolution: "<0.2°",
    temperatureRange: "6K - 400K",
    analyzerRadius: "200mm"
  },
  installationYear: 2018,
  status: "operational",
  serialNumber: "DA30-2018-0042"
})
```

### 12.2 设备关系类型

```
(lab)-[:HAS_EQUIPMENT {acquisitionYear, fundingSource}]->(equipment)
(equipment)-[:USED_BY {startYear, endYear, usageType}]->(person)
(equipment)-[:USED_FOR {relevance}]->(researchDirection)
(paper)-[:USES_EQUIPMENT {methodSection}]->(equipment)
```

### 12.3 商业价值

- **设备 → 潜在客户**：使用同类设备的实验室是潜在客户
- **技术方向 → 设备需求**：新研究方向需要特定设备
- **设备机龄 → 更新需求**：安装年份早的设备即将需要更新
- **论文方法 → 设备用户**：方法章节提到某设备的论文作者是潜在用户

---

## 13. 知识质量引擎 Knowledge Guardian

### 13.1 职责

Knowledge Guardian 是长期运行的知识质量维护 Agent，负责：

1. **事实验证**：新入库的 Fact 是否通过多源交叉验证
2. **冲突检测**：同一 Claim 在不同来源中是否矛盾
3. **数据老化检测**：上次爬取时间超过阈值的实体是否需要重新验证
4. **错误修复**：根据人工反馈修正已入库事实

### 13.2 Fact 状态管理

```
Candidate ──→ Verification ──→ Verified ──→ (time passes) ──→ Expired
    │              │                 │
    └──→ Rejected  └──→ Conflict ──→ Resolution ──→ Verified / Rejected
```

### 13.3 定期巡检任务

| 任务 | 频率 | 操作 |
|------|------|------|
| 孤立节点检测 | 每日 | 标记零关系的节点 |
| 过期数据检测 | 每日 | 上次验证超过 30 天 → 入队重新验证 |
| 循环引用检测 | 每周 | 检测 ADVISOR_OF 环 |
| 证据断裂检测 | 每周 | 关系缺少 Evidence → 进入修复队列 |
| 全面质量报告 | 每月 | 生成 DQ 评分和 TOP-N 问题清单 |

---

## 14. 自动验证与冲突处理机制

### 14.1 多源交叉验证

同一个 Fact 来自多个独立来源 → 置信度加权提升。

```
Fact: "Zhi-Xun Shen WORKS_AT Stanford University"
Source A: Stanford faculty page → confidence 0.95, weight 1.0
Source B: ORCID → confidence 0.90, weight 0.9
Source C: Recent paper affiliation → confidence 0.85, weight 0.7

Combined Confidence = 1 - (1-0.95)*(1-0.90*0.9)*(1-0.85*0.7) = 0.988
→ 状态: Verified (≥ 0.95)
```

### 14.2 冲突处理

当两个来源给出矛盾信息时，**禁止简单覆盖旧数据**。

```
Conflict: Person X WORKS_AT MIT (Source A, 2024-01) vs
          Person X WORKS_AT Harvard (Source B, 2024-06)

处理流程:
1. 比较来源可信度 → Source A 可信度 0.95, Source B 可信度 0.90
2. 检查时间线 → 可能真实转职（MIT → Harvard）
3. LLM Judge Agent 分析 → 判定为时间序列变更而非错误
4. 更新为带日期的隶属关系：MIT [2020-2024], Harvard [2024-present]
```

---

## 15. 置信度评分模型 Confidence Score

### 15.1 评分公式

```
Final Confidence = Source Authority × Evidence Quality × Cross Validation × Freshness

其中：
- Source Authority: Tier 0=1.0, Tier 1=0.9, Tier 2=0.6
- Evidence Quality: 官方文件=1.0, 网页快照=0.85, LLM提取=0.70, 推断=0.40
- Cross Validation: 单源=0.8, 双源=0.95, 三源+=0.99
- Freshness: < 30天=1.0, 30-90天=0.9, 90-180天=0.7, >180天=0.5
```

### 15.2 准入阈值

| 实体/关系类型 | Production Graph 最低阈值 |
|-------------|------------------------|
| Person 基本档岸 | 0.7 |
| 机构隶属 | 0.8 |
| 导师-学生 | 0.8（双源验证） |
| 合作关系 | 0.6 |
| 设备关系 | 0.7 |
| 引用关系 | 0.95 |

---

## 16. 数据同步与更新策略

### 16.1 按数据变化频率分级

| 变化频率 | 数据类型 | 同步周期 | 触发方式 |
|---------|---------|---------|---------|
| 高频 | 论文发表、引用计数 | 每日 | Cron 定时 + API |
| 中频 | 实验室成员 | 每月 | Cron 定时 |
| 低频 | 教授主页、研究方向 | 每季度 | Cron 定时 |
| 极低频 | 机构信息、设施参数 | 每半年 | Cron 定时 |
| 按需 | 特定 URL 爬取 | 手动触发 | API `POST /pipeline/run` |

### 16.2 同步调度

```
每日 02:00 → 论文引用更新 (Semantic Scholar API)
每日 04:00 → 新论文发现 (arXiv API)
每周日 03:00 → 实验室主页重爬 + 成员更新 + 消歧
每月 1日 04:00 → 深度消歧 + 证据验证 + 质量报告
每季度 → 全量机构信息更新
```

---

## 17. 人工审核与反馈闭环 Human-in-the-loop

### 17.1 审核队列

所有低置信度（< 0.8）数据进入审核队列：

| 优先级 | 条件 | 描述 |
|--------|------|------|
| **P0 高** | 置信度 0.5-0.6 + 多条依赖关系 | 疑似重复人物，合并错误会影响大量关系 |
| **P1 中** | 置信度 0.6-0.7 | 需要人工验证的导师关系或机构归属 |
| **P2 低** | 置信度 0.7-0.8 | 自动创建但需要后期确认 |

### 17.2 反馈闭环

```
用户纠正 → Feedback 记录 → Agent 学习 → 模型更新 → 准确率提升
     ↑                                                      |
     └──────────── 自动重标同类错误 ←────────────────────────┘
```

- 用户纠正的记录成为训练数据（用于优化 Prompt 和匹配规则）
- 同类型错误被自动重标（如发现某机构的网页结构变化导致提取失败）
- 人工反馈反哺 Validation Agent，持续提高系统准确率

---

## 18. 图数据库设计 Graph Storage Architecture

### 18.1 存储分层

```
┌─────────────────────────────────────────┐
│  Neo4j — 核心知识图谱                     │
│  Nodes: Person, Lab, University,         │
│         Equipment, Paper, ResearchDirection,│
│         Company, Facility, Source, Event │
│  Edges: ADVISOR_OF, MEMBER_OF, CITES,    │
│         AUTHORED_BY, HAS_EQUIPMENT, ...   │
│  Facts + Evidence 内嵌于关系属性           │
└─────────────────────────────────────────┘
          ↕
┌─────────────────────────────────────────┐
│  PostgreSQL — 结构化元数据                 │
│  Tables: users, audit_log, sync_history, │
│          review_queue, feedback          │
└─────────────────────────────────────────┘
          ↕
┌─────────────────────────────────────────┐
│  Redis — 缓存 / 任务队列                   │
│  BullMQ Queues: crawl, extract, resolve, │
│  build-graph, validate, dead-letter      │
│  Cache: 高频搜索结果, 热门人物 Profile      │
└─────────────────────────────────────────┘
          ↕
┌─────────────────────────────────────────┐
│  MinIO / S3 — 证据文件存储                 │
│  - 网页快照 (HTML/截图)                    │
│  - PDF 文件                               │
│  - 图片来源备份                            │
└─────────────────────────────────────────┘
```

### 18.2 Graph Schema 核心约束

```
Node Key:     每个节点必须有 uuid (唯一)、createdAt、updatedAt
Edge Must:    每条边必须有 confidence、source、evidenceUrl、createdAt
No Delete:    节点永不删除, 仅标记 archived=true
Provenance:   每个实体通过 SOURCED_FROM 链接到 Source 节点
```

---

## 19. 搜索与关系发现 Search Intelligence

### 19.1 混合搜索架构

```
查询 "ARPES topological insulator"
      ↓
┌─────────────────────────────────────────┐
│  Graph Search (Neo4j full-text)          │
│  → 精确匹配实体名称/描述                   │
│  → 返回: Person, Lab, Equipment, Paper   │
│  → 分面筛选: 类型/国家/研究领域             │
└─────────────────────────────────────────┘
      +
┌─────────────────────────────────────────┐
│  Vector Search (TF-IDF / Qdrant)         │
│  → 语义相似度匹配                         │
│  → 返回: 概念相关但词语不完全匹配的结果      │
│  → 适合: 研究方向发现、交叉领域搜索         │
└─────────────────────────────────────────┘
      ↓
  融合排序 → Combined Score = 0.5 × GraphScore + 0.5 × VectorScore
```

### 19.2 核心搜索场景

| 搜索场景 | 输入 | 期望输出 |
|---------|------|---------|
| 找人 | "ARPES 拓扑绝缘体" | 相关教授 + 实验室 + 关键论文 |
| 找关系 | "谁的学生在做 kagome 金属" | 学术家谱 + 最新论文 |
| 找设备 | "上海有哪些 DA30" | 设备位置 + 拥有实验室 + 联系人 |
| 找网络 | "沈志勋的合作者都有谁" | 合作者图谱 + 共同论文 |

---

## 20. AI Agent 架构设计

### 20.1 Agent 分工

```
                    ┌─────────────┐
                    │ Master Agent │ (任务拆分、路由、编排)
                    └──────┬──────┘
        ┌──────────┬──────┼──────┬──────────┬──────────┐
        ↓          ↓      ↓      ↓          ↓          ↓
   ┌─────────┐ ┌──────┐ ┌────┐ ┌──────┐ ┌──────┐ ┌──────────┐
   │ Crawler │ │Parser│ │Ext-│ │Iden- │ │Rela- │ │Knowledge │
   │ Agent   │ │Agent │ │rac-│ │tity  │ │tion- │ │Guardian  │
   │         │ │      │ │tor │ │Agent │ │ship  │ │          │
   │ 爬取    │ │ 解析 │ │实体│ │ 消歧 │ │Agent │ │ 质量维护 │
   │ 发现    │ │ 清洗 │ │抽取│ │ 合并 │ │ 关系 │ │ 验证     │
   └─────────┘ └──────┘ └────┘ └──────┘ └──────┘ └──────────┘
        ↓          ↓      ↓      ↓          ↓          ↓
   ┌─────────────────────────────────────────────────────────┐
   │                    Event Bus (内存 / Redis Pub/Sub)       │
   │  RawDocument → StructuredDoc → ExtractedEntity →        │
   │  ResolvedEntity → GraphUpdate → ValidationReport        │
   └─────────────────────────────────────────────────────────┘
```

### 20.2 Agent 通信协议

- **Stateless**: 所有 Agent 是无状态的，通过 Event Bus 通信
- **Idempotent**: 同一条消息处理多次产生相同结果
- **Asynchronous**: Agent 处理完成后发射下游事件
- **Dead Letter**: 失败任务进入死信队列，人工介入

---

## 21. 数据质量指标体系 Data Quality Metrics

### 21.1 核心指标

| 指标 | MVP 目标 | 定义 |
|------|---------|------|
| 人物姓名准确率 | > 95% | 姓名与 ORCID/机构页面一致的人物占比 |
| 机构准确率 | > 98% | 机构名称标准化正确的占比 |
| 导师-学生关系准确率 | > 90% | 人工抽查确认正确的导师关系占比 |
| 证据覆盖率 | > 80% | 至少带 1 条证据的关系占比 |
| 重复率 | < 5% | 同一实体出现多次的占比 |
| 过期率 | < 10% | 上次验证超过 90 天的实体占比 |
| 孤立节点率 | < 3% | 零关系节点在总节点中的占比 |

### 21.2 数据质量监控

```bash
# 每日自动生成 DQ Report
GET /api/v1/pipeline/status

# 返回:
{
  "totalEntities": 1500,
  "totalRelationships": 3200,
  "withEvidence": 2800,
  "orphanNodes": 12,
  "duplicateCandidates": 3,
  "expiredValidation": 45,
  "overallScore": 0.87
}
```

---

## 22. MVP 实施范围

### 22.1 第一阶段聚焦 ARPES 领域

| 维度 | MVP 目标 |
|------|---------|
| 研究人员 | 1,000+ |
| 实验室 | 300+ |
| 机构/大学 | 200+ |
| 设备 | 200+ (ARPES/MBE/STM/TEM 等) |
| 论文 | 20,000+ |
| 同步辐射设施 | 50+ |
| 学术关系 | 覆盖 20 年 (2005-2025) |
| 导师-学生链 | 核心 50 个教授完整家谱 |

### 22.2 MVP 后扩展

- 多学科扩展（材料科学 → 化学 → 光学 → 纳米 → 生物物理）
- 工业客户关系（Company, Patent, Project, Funding, Product）
- 采购关系图谱
- 商业智能分析

---

## 23. 商业智能扩展方向

在可信科研关系图谱基础上，可扩展以下商业场景：

1. **客户发现**: 从技术方向发现潜在客户，从设备类型发现对标实验室
2. **销售机会预测**: 设备机龄分析 → 更新需求预测, 新建实验室 → 设备采购窗口
3. **采购窗口预测**: 新教授入职 → 设备采购周期, 基金获批 → 设备预算释放
4. **关键影响人分析**: 学术家谱 → 识别领域内的 Hub 节点（大量学生、高引用、大合作网络）
5. **行业地图**: 生成某技术方向的完整产业地图——哪些实验室、用什么设备、做什么方向、谁在领导
6. **人才招聘**: 追踪某教授的学生去向，识别即将独立建组的优秀博士后
