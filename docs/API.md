# Targon Nexus API Design

## Overview

NestJS REST API. V1 focuses on read-heavy academic graph queries. No write APIs for end users (data is system-managed).

---

## Base URL

```
Development: http://localhost:3000/api/v1
Production:  https://api.targon-nexus.com/v1
```

---

## Common Patterns

### Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 342
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "Person with UUID xxx not found"
  }
}
```

---

## Endpoints

### 1. Search

```
GET /search?q={query}&type={entityType}&page=1&pageSize=20
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| q | string | Search query (Chinese, English, pinyin, abbreviation) |
| type | enum | person, lab, university, equipment, research_direction, paper |
| page | int | Page number (default 1) |
| pageSize | int | Results per page (default 20, max 100) |

**Response**: `{ items: Entity[], total: number }`

---

### 2. Person

```
GET  /persons/:uuid              — Profile
GET  /persons/:uuid/students     — Students
GET  /persons/:uuid/advisors     — Advisors
GET  /persons/:uuid/coauthors    — Co-authors
GET  /persons/:uuid/papers       — Papers
GET  /persons/:uuid/labs         — Lab affiliations
GET  /persons/:uuid/timeline     — Career timeline
GET  /persons/:uuid/graph        — Ego network (1-hop)
```

---

### 3. Lab

```
GET  /labs/:uuid                 — Lab profile
GET  /labs/:uuid/members         — Current members
GET  /labs/:uuid/alumni          — Alumni
GET  /labs/:uuid/equipment       — Equipment
GET  /labs/:uuid/directions      — Research directions
GET  /labs/:uuid/papers          — Publications
GET  /labs/:uuid/collaborators   — Collaborating labs
GET  /labs/:uuid/timeline        — Lab timeline
GET  /labs/:uuid/graph           — Lab ego network
```

---

### 4. University

```
GET  /universities/:uuid         — University profile
GET  /universities/:uuid/schools     — Schools
GET  /universities/:uuid/labs        — Research labs
GET  /universities/:uuid/persons     — Researchers
```

---

### 5. Research Direction

```
GET  /directions                 — Browse taxonomy tree
GET  /directions/:uuid           — Direction detail
GET  /directions/:uuid/labs      — Associated labs
GET  /directions/:uuid/persons   — Associated researchers
GET  /directions/:uuid/papers    — Key papers
GET  /directions/:uuid/equipment — Equipment used
GET  /directions/:uuid/children  — Sub-directions
GET  /directions/tree            — Full taxonomy tree
```

---

### 6. Equipment

```
GET  /equipment                  — List equipment
GET  /equipment/:uuid            — Equipment detail
GET  /equipment/:uuid/labs       — Labs using this equipment
GET  /equipment/:uuid/directions — Research directions
GET  /equipment/categories       — Equipment taxonomy
```

---

### 7. Paper

```
GET  /papers/:doi                — Paper detail
GET  /papers/:doi/authors        — Authors
GET  /papers/:doi/citations      — Citing papers
GET  /papers/:doi/references     — References
```

---

### 8. Graph Query (Natural Language)

```
POST /graph/query

Request:
{
  "query": "有哪些做二维材料 ARPES 的团队？"
}

Response:
{
  "cypher": "MATCH (l:Lab)-[:RESEARCHES_ON]->(d:ResearchDirection) WHERE d.name CONTAINS '2D Materials' AND ... RETURN l",
  "results": [ ... ],
  "explanation": "..."
}
```

---

### 9. Timeline

```
GET  /timeline/person/:uuid      — Person career timeline
GET  /timeline/lab/:uuid         — Lab evolution timeline
GET  /timeline/direction/:uuid   — Research direction development
```

---

### 10. Admin (Internal)

```
POST /admin/crawl/trigger        — Trigger crawl job
POST /admin/sync/trigger         — Trigger full sync
GET  /admin/jobs                 — Job status
GET  /admin/issues               — Validation issues
POST /admin/entities/:uuid/merge — Manual merge
POST /admin/entities/:uuid/flag  — Flag for review
```

---

## GraphQL (Future)

V1.5 will add a GraphQL endpoint for flexible graph queries:

```graphql
type Person {
  uuid: ID!
  chineseName: String
  englishName: String
  students: [Person!] @relationship(type: "ADVISOR_OF", direction: OUT)
  labs: [Lab!] @relationship(type: "MEMBER_OF", direction: OUT)
  # ...
}
```

---

## Rate Limiting

| Tier | Limit |
|------|-------|
| Search | 60 req/min |
| Profile | 120 req/min |
| Graph Query | 30 req/min |
| Admin | Unlimited (authenticated) |

---

## Caching Strategy

- **Redis** for search results (TTL: 5 min)
- **Neo4j Query Cache** for graph queries
- **CDN** for static profile data
- Cache invalidation on graph update events
