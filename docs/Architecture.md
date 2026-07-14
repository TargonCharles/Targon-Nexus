# Targon Nexus Architecture

## Overview

Targon Nexus 采用微服务 + Event-Driven 架构，以 **Neo4j 图数据库** 为核心，围绕 Academic Knowledge Graph 构建整个系统。

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                     │
│                   (apps/web)                             │
│   Academic Search / Graph Visualization / Profiles       │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP / GraphQL
┌─────────────────────▼───────────────────────────────────┐
│                   NestJS API Gateway                      │
│                   (apps/api)                             │
│   REST API / GraphQL / Auth / Rate Limiting              │
└──┬──────────┬──────────┬──────────┬─────────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│PostgreSQL│ │Neo4j │ │Redis │ │Message Q │
│(metadata)│ │(graph)│ │(cache)│ │(events)  │
└──────┘ └──────┘ └──────┘ └────┬─────┘
                                │
    ┌───────────────────────────┼───────────────────────┐
    │                           │                       │
    ▼                           ▼                       ▼
┌────────┐              ┌────────────┐          ┌──────────┐
│Crawler │              │ Extractor  │          │ Scheduler│
│Service │              │  Service   │          │ Service  │
└───┬────┘              └─────┬──────┘          └────┬─────┘
    │                         │                      │
    ▼                         ▼                      │
┌────────┐              ┌────────────┐               │
│Parser  │              │Graph Builder│              │
│Service │              │  Service   │◄──────────────┘
└────────┘              └────────────┘
```

---

## Layer Breakdown

### 1. Frontend Layer (`apps/web`)

- **Framework**: Next.js (React)
- **Rendering**: SSR + ISR
- **Visualization**: D3.js / Cytoscape.js for graph rendering
- **State**: React Query for server state

### 2. API Layer (`apps/api`)

- **Framework**: NestJS
- **Protocol**: REST + GraphQL
- **Authentication**: JWT (global JwtAuthGuard + @Public() opt-out)
- **Rate Limiting**: ThrottlerModule + ThrottlerGuard (100 req/min)
- **Distributed Lock**: LockService (in-memory / Redis-swappable)
- **HTTP Client**: HttpClientService (retry, timeout, UA header)
- **LLM Client**: LlmClientService (OpenAI-compatible unified interface)

#### Service Architecture

```
Controller Layer (thin — HTTP routing only)
  ├── PipelineController  → PipelineService / DedupService / SeedService / LockService
  ├── QualityController   → QualityService / EvidenceService / CareerPathService / ValidationService
  ├── SearchController    → SearchService
  ├── PersonController    → PersonService
  ├── PaperController     → PaperService
  ├── LabController       → LabService
  └── ...                 → ...

Shared Helpers (@arp/shared)
  ├── paginate()          → 统一分页计算
  ├── extractJsonArray()  → LLM 响应 JSON 解析
  ├── generateUUID()      → UUID v4 生成
  └── buildGraphFromRows()→ Neo4j 行 → 图谱结构
```

### 3. Data Pipeline Layer

```
Discovery → Crawler → Parser → Extractor → Identity Resolution → Graph Builder
```

| Service | Technology | Responsibility |
|---------|-----------|---------------|
| crawler | Playwright + Crawlee | Web scraping, PDF download |
| extractor | LLM (OpenAI Compatible via LlmClientService) | Entity/relationship extraction |
| graph-builder | Neo4j Driver | Node/Relationship/Evidence creation |
| scheduler | BullMQ / Cron + runScheduledTask wrapper | Periodic sync, revalidation |
| worker | BullMQ + singleton Neo4j driver | Background job processing |
| dedup | Neo4j Cypher (DedupService) | 3-phase person dedup (ORCID/name/fuzzy) |
| seed | Cypher file I/O (SeedService) | Seed data import with path safety |
| validation | Neo4j queries (ValidationService) | ORCID/email/URL/confidence checks |

### 4. Storage Layer

| Database | Purpose |
|----------|---------|
| **Neo4j** | Primary — Knowledge Graph (nodes, relationships, evidence) |
| **PostgreSQL** | Metadata, user accounts, audit logs, job queues |
| **Redis** | Cache, session, rate limiting |

### 5. Agent Layer (`agents/`)

AI Agents are stateless, event-driven workers. Each agent:
- Receives events from the Message Queue
- Processes independently
- Publishes results back to the Event Bus
- Never directly accesses databases (uses API)

See `agents/` directory for individual agent definitions.

---

## Data Flow

```
1. Scheduler triggers daily sync job
2. Discovery Agent finds new URLs/entities
3. Crawler Agent fetches raw HTML/PDF
4. Parser Agent converts to structured documents
5. Extraction Agent (LLM) identifies entities & relationships
6. Identity Resolution Agent deduplicates & normalizes
7. Graph Builder Agent writes nodes/edges to Neo4j
8. Validation Agent checks quality
9. QA Agent generates daily report
```

---

## Event Bus

All services communicate asynchronously via an Event Bus:

- **DiscoveryEvent** — new URL/entity found
- **CrawlEvent** — page fetched
- **ParseEvent** — document structured
- **ExtractionEvent** — entities/relationships found
- **ResolutionEvent** — entity canonicalized
- **GraphEvent** — graph updated
- **ValidationEvent** — issues detected

---

## Design Principles

1. **Graph Native** — Neo4j is the source of truth for relationships
2. **Stateless Services** — all services are stateless, horizontally scalable
3. **Event Driven** — services communicate only through events
4. **Evidence First** — every relationship must carry source evidence
5. **AI Assisted, Human Verifiable** — AI suggests, humans confirm
6. **Continuous Update** — system runs on a daily sync cycle

---

## Deployment

- **Orchestration**: Docker Compose (dev) / Kubernetes (production)
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack
