# Targon Nexus Graph Schema (Neo4j)

## Overview

ARP 以 Neo4j 作为核心图数据库。所有实体建模为 **Node**，所有关联建模为 **Relationship**。每个 Relationship 必须携带 **Evidence** 信息。

---

## Node Labels

### Core Entities (V1)

| Label | Description | Key Properties |
|-------|-------------|---------------|
| `Person` | 科研人员 | uuid, chineseName, englishName, aliases[], orcid, scholarUrl, homepage, email, avatar, biography, researchInterests[], currentStatus, confidence |
| `Lab` | 课题组/实验室 | uuid, name, englishName, abbreviation, homepage, description, foundedYear, currentStatus, keywords[], country, city, latitude, longitude |
| `University` | 大学 | uuid, chineseName, englishName, country, city, website, logo, description |
| `School` | 学院 | uuid, name, englishName |
| `Department` | 系 | uuid, name, englishName |
| `ResearchDirection` | 研究方向 | uuid, name, level, description, aliases[] |
| `Equipment` | 科研设备 | uuid, name, brand, manufacturer, model, generation, description, category, keywords[] |
| `Paper` | 论文 | doi, title, authors[], journal, conference, year, citationCount, keywords[], url |
| `Company` | 公司(仅毕业去向) | uuid, name, country, city, website, industry |
| `Source` | 数据来源 | url, title, publisher, collectedTime, verifiedTime, confidence, license |
| `Event` | 时间事件 | uuid, type, date, description, evidence |

---

## Relationships

### Person Relationships

```
(:Person)-[:ADVISOR_OF]->(:Person)          // 导师关系
(:Person)-[:STUDENT_OF]->(:Person)          // 学生关系
(:Person)-[:COAUTHOR_WITH]->(:Person)       // 合作关系
(:Person)-[:MEMBER_OF]->(:Lab)              // 当前成员
(:Person)-[:ALUMNI_OF]->(:Lab)              // 毕业校友
(:Person)-[:WORKS_AT]->(:Company)           // 毕业去向
(:Person)-[:AFFILIATED_WITH]->(:University) // 所属大学
```

### Lab Relationships

```
(:Lab)-[:BELONGS_TO]->(:University)         // 所属大学
(:Lab)-[:PART_OF]->(:School)                // 所属学院
(:Lab)-[:COLLABORATES_WITH]->(:Lab)         // 合作课题组
(:Lab)-[:HAS_EQUIPMENT]->(:Equipment)       // 拥有设备
(:Lab)-[:RESEARCHES_ON]->(:ResearchDirection)// 研究方向
(:Lab)-[:PUBLISHED]->(:Paper)               // 发表论文
(:Lab)-[:HAS_MEMBER]->(:Person)             // 当前成员
(:Lab)-[:HAS_ALUMNI]->(:Person)             // 毕业校友
```

### Research Direction Relationships

```
(:ResearchDirection)-[:PARENT_OF]->(:ResearchDirection)  // 父子关系
(:ResearchDirection)-[:RELATED_TO]->(:ResearchDirection) // 相关方向
(:ResearchDirection)-[:ALIAS_OF]->(:ResearchDirection)   // 别名
```

### Equipment Relationships

```
(:Equipment)-[:USED_BY]->(:Lab)             // 使用单位
(:Equipment)-[:BELONGS_TO_CATEGORY]->(:Category)// 分类
(:Equipment)-[:USED_FOR]->(:ResearchDirection)// 用于研究方向
```

### Paper Relationships

```
(:Paper)-[:AUTHORED_BY]->(:Person)          // 作者
(:Paper)-[:PUBLISHED_IN]->(:Journal)        // 期刊
(:Paper)-[:CITES]->(:Paper)                 // 引用
(:Paper)-[:ABOUT]->(:ResearchDirection)     // 研究方向
```

### University Relationships

```
(:University)-[:HAS_SCHOOL]->(:School)      // 包含学院
(:School)-[:HAS_DEPARTMENT]->(:Department)   // 包含系
(:Department)-[:HAS_LAB]->(:Lab)            // 包含课题组
```

### Evidence Relationship (必须)

All relationships MUST carry the following properties:

```cypher
{
  source: "<Source UUID or URL>",
  confidence: 0.0-1.0,
  collectedAt: "<ISO 8601 timestamp>",
  verifiedAt: "<ISO 8601 timestamp>",
  evidence: "<evidence description>",
  evidenceUrl: "<URL of evidence>"
}
```

---

## Constraints

```cypher
// Unique UUIDs
CREATE CONSTRAINT person_uuid IF NOT EXISTS FOR (p:Person) REQUIRE p.uuid IS UNIQUE;
CREATE CONSTRAINT lab_uuid IF NOT EXISTS FOR (l:Lab) REQUIRE l.uuid IS UNIQUE;
CREATE CONSTRAINT university_uuid IF NOT EXISTS FOR (u:University) REQUIRE u.uuid IS UNIQUE;
CREATE CONSTRAINT paper_doi IF NOT EXISTS FOR (p:Paper) REQUIRE p.doi IS UNIQUE;
CREATE CONSTRAINT equipment_uuid IF NOT EXISTS FOR (e:Equipment) REQUIRE e.uuid IS UNIQUE;
CREATE CONSTRAINT research_direction_uuid IF NOT EXISTS FOR (r:ResearchDirection) REQUIRE r.uuid IS UNIQUE;
CREATE CONSTRAINT company_uuid IF NOT EXISTS FOR (c:Company) REQUIRE c.uuid IS UNIQUE;
CREATE CONSTRAINT source_url IF NOT EXISTS FOR (s:Source) REQUIRE s.url IS UNIQUE;
CREATE CONSTRAINT event_uuid IF NOT EXISTS FOR (e:Event) REQUIRE e.uuid IS UNIQUE;
```

---

## Indexes

```cypher
// Name indexes for search
CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.chineseName);
CREATE INDEX person_english_name IF NOT EXISTS FOR (p:Person) ON (p.englishName);
CREATE INDEX lab_name IF NOT EXISTS FOR (l:Lab) ON (l.name);
CREATE INDEX university_name IF NOT EXISTS FOR (u:University) ON (u.chineseName);
CREATE INDEX equipment_name IF NOT EXISTS FOR (e:Equipment) ON (e.name);
CREATE INDEX research_direction_name IF NOT EXISTS FOR (r:ResearchDirection) ON (r.name);
CREATE INDEX paper_title IF NOT EXISTS FOR (p:Paper) ON (p.title);
```

---

## Full-Text Indexes

```cypher
CREATE FULLTEXT INDEX person_search IF NOT EXISTS
FOR (p:Person)
ON EACH [p.chineseName, p.englishName, p.aliases, p.biography, p.researchInterests];

CREATE FULLTEXT INDEX lab_search IF NOT EXISTS
FOR (l:Lab)
ON EACH [l.name, l.englishName, l.abbreviation, l.description, l.keywords];

CREATE FULLTEXT INDEX research_search IF NOT EXISTS
FOR (r:ResearchDirection)
ON EACH [r.name, r.description, r.aliases];

CREATE FULLTEXT INDEX equipment_search IF NOT EXISTS
FOR (e:Equipment)
ON EACH [e.name, e.brand, e.model, e.description, e.keywords];

CREATE FULLTEXT INDEX paper_search IF NOT EXISTS
FOR (p:Paper)
ON EACH [p.title, p.keywords, p.authors];
```

---

## Graph Integrity Rules

1. **No orphan nodes** — every Person must have at least one relationship
2. **No circular advisorship** — `(:Person)-[:ADVISOR_OF*]->(:Person)` must not form a cycle
3. **No duplicate entities** — enforced by UUID constraints + Identity Resolution
4. **Every relationship has evidence** — enforced at application layer
5. **Research Direction must form valid DAG** — no circular references allowed
6. **Soft delete only** — use `status: 'archived'` instead of deleting nodes

---

## Example: Professor Query

```cypher
// Get a professor's full academic network
MATCH (p:Person {uuid: $uuid})
OPTIONAL MATCH (p)-[:ADVISOR_OF]->(student:Person)
OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)
OPTIONAL MATCH (lab)-[:RESEARCHES_ON]->(dir:ResearchDirection)
OPTIONAL MATCH (lab)-[:HAS_EQUIPMENT]->(eq:Equipment)
OPTIONAL MATCH (p)-[:COAUTHOR_WITH]->(coauthor:Person)
RETURN p, student, lab, dir, eq, coauthor
```

---

## Example: Alumni Flow

```cypher
// Trace alumni destinations from a lab
MATCH (lab:Lab {uuid: $uuid})
MATCH (p:Person)-[:ALUMNI_OF]->(lab)
OPTIONAL MATCH (p)-[:WORKS_AT]->(company:Company)
OPTIONAL MATCH (p)-[:STUDENT_OF]->(advisor:Person)
RETURN p, company, advisor
ORDER BY p.graduationYear DESC
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-10 | Initial graph schema for ARPES V1 |
