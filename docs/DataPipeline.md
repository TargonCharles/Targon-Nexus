# Targon Nexus Data Pipeline

## Overview

Targon Nexus 的数据管道是一个多阶段 ETL（Extract, Transform, Load）流水线，将公开网页数据转化为结构化的学术关系知识图谱。

---

## Pipeline Stages

```
Seed Data → Discovery → Crawling → Parsing → Extraction → Resolution → Graph Build → Validation → Indexing
```

---

## Stage 1: Discovery

**Service**: `apps/crawler` + Agent: `agents/crawler-agent`

Discover new ARPES-related entities from:
- University department pages
- Lab group pages
- Google Scholar profiles
- ORCID records
- ResearchGate profiles
- Published papers
- Conference proceedings
- News articles

**Output**: `DiscoveryEvent { type, url, source, confidence }`

---

## Stage 2: Crawling

**Service**: `apps/crawler`

Fetch raw content using Playwright + Crawlee:
- HTML pages (lab homepages, university profiles)
- PDF files (papers, CVs)
- Images (avatars, lab photos)

**Features**:
- Respect robots.txt
- Rate limiting (max 1 req/sec per domain)
- Retry with exponential backoff
- Persistent request queue
- Proxy rotation support

**Output**: `RawDocument { url, html, pdfUrl, collectedAt }`

---

## Stage 3: Parsing

**Service**: `apps/extractor` + Agent: `agents/parser-agent`

Convert raw documents to structured format:
- HTML → Markdown
- PDF → Text (via OCR if needed)
- Extract structured data (tables, lists)

**Output**: `StructuredDocument { url, markdown, metadata, parsedAt }`

---

## Stage 4: Extraction (LLM)

**Service**: `apps/extractor` + Agent: `agents/parser-agent`

Use LLM to identify:
- **Entities**: Person, Lab, University, Equipment, Research Direction, Paper
- **Relationships**: Advisor-Student, Member-Lab, Alumni-Destination, Collaboration
- **Attributes**: names, titles, emails, URLs, research interests

**Prompt Strategy**:
- System prompt defines ARPES domain context
- Few-shot examples for each entity type
- Chain-of-thought for complex extractions
- Structured JSON output with schema validation

**Output**: `CandidateEntity[]` + `CandidateRelationship[]`

---

## Stage 5: Identity Resolution

**Service**: `apps/extractor` + Agent: `agents/resolver-agent`

Resolve duplicate entities:
- **Person**: match by ORCID, email, name+affiliation
- **Lab**: match by name+university, homepage URL
- **Equipment**: match by name+manufacturer+lab
- **Research Direction**: match to existing taxonomy

**Resolution Strategies**:
1. Exact match on unique identifiers (ORCID, DOI, email)
2. Fuzzy match on name + affiliation
3. LLM-based disambiguation for ambiguous cases
4. Manual review queue for low-confidence matches

**Output**: `CanonicalEntity` (merged, deduplicated)

---

## Stage 6: Graph Building

**Service**: `apps/graph-builder` + Agent: `agents/graph-agent`

Write entities and relationships to Neo4j:
1. Create/merge nodes with canonical UUIDs
2. Create relationships with evidence properties
3. Create timeline events
4. Link all entities to Source nodes

**Output**: `GraphEvent { nodesCreated, relationshipsCreated, timestamp }`

---

## Stage 7: Validation

**Service**: `apps/worker` + Agent: `agents/qa-agent`

Validate data quality:
- Orphan node detection
- Circular relationship detection
- Missing evidence detection
- Timestamp consistency checks
- Duplicate detection (re-run)

**Output**: `Issue[]` (if any)

---

## Stage 8: Indexing

**Service**: `apps/graph-builder`

Update search indexes:
- Neo4j full-text indexes
- PostgreSQL search vectors
- Redis cache invalidation

---

## Scheduling

**Service**: `apps/scheduler` + Agent: `agents/updater-agent`

Default schedule:

| Frequency | Task |
|-----------|------|
| Daily (2am UTC) | Full re-crawl of all known lab pages |
| Daily (4am UTC) | Re-extraction & identity resolution |
| Daily (6am UTC) | Graph update & validation |
| Weekly (Sunday) | New lab discovery sweep |
| On-demand | Manual trigger via API |

---

## Error Handling

- Each stage is independent and idempotent
- Failures at one stage do not block other stages
- Failed jobs go to dead-letter queue for manual review
- Retry with exponential backoff (max 3 attempts)
- All errors logged with full context

---

## Monitoring

| Metric | Target |
|--------|--------|
| Pipeline latency (end-to-end) | < 4 hours for daily sync |
| Crawler success rate | > 95% |
| Extraction confidence (avg) | > 0.7 |
| Resolution accuracy | > 95% |
| Graph node freshness | < 24 hours |

---

## Seed Data Sources (V1 — ARPES)

Initial seed data will be curated from:
1. Known ARPES labs worldwide (~300 labs)
2. Manual curation of top ARPES groups
3. Conference participant lists (ARW, ISS)
4. Published ARPES review papers
5. Synchrotron facility user lists
