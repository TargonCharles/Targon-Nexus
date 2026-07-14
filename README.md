# Targon Nexus — Targon Nexus

> AI 驱动的科研关系知识图谱 · 自动发现全球研究人员、实验室、设备之间的关联

---

## 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 搜索 API | ✅ | 全文搜索 + 分面筛选（类型/国家/领域） |
| 人物图谱 | ✅ | 树状学术家谱 + 力导向关系图 |
| 数据管道 | ✅ | 爬取 → LLM 提取 → Neo4j 写入 |
| 前端 | ✅ | Next.js + 深色首页 + 筛选搜索页 |
| 数据规模 | 🚧 | ARPES 领域 40+ 人物/实验室/设备 |
| AI Agent | 📋 | Multi-Agent 架构规划中 |
| 工业扩展 | 📋 | 未来版本 |

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18  ·  **pnpm** ≥ 8  ·  **Docker** (Neo4j, PostgreSQL, Redis)

### 启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库
pnpm docker:dev

# 3. 导入 ARPES 知识图谱种子数据（一步完成）
pnpm seed

# 4. 启动开发服务器
pnpm dev
```

然后打开 `http://localhost:3000`。

---

## 项目结构

```
apps/
  api/          NestJS API — REST 接口、分面搜索、管道触发器
  web/          Next.js 前端 — 搜索、图谱、人物画像
  crawler/      爬虫 — Playwright + Crawlee
  extractor/    LLM 提取 — 实体/关系识别
  graph-builder/ 图谱构建 — Neo4j 写入
  scheduler/    定时任务 — Cron 调度
  worker/       任务队列 — BullMQ Worker

packages/
  shared/       工具库 — UUID、名称标准化、置信度、日志、管道
  types/        类型定义 — 领域实体 + 管道 Job 类型
  prompts/      LLM Prompt 模板 — 版本管理
  sdk/          JS SDK — Targon Nexus API 客户端
  ui/           UI 组件 — GraphCanvas、GenealogyTree、SearchBar

graph/
  schema/       Neo4j 图模型
  cypher/       查询 + 种子数据
  migrations/   图数据库迁移

infra/          Docker Compose + Nginx + Dockerfile
scripts/        管道 CLI + 迁移脚本
docs/           架构/PRD/API 文档
```

---

## 数据管道

```
种子 URL → 爬虫(fetch) → LLM(DeepSeek) → 实体+关系 → Neo4j (节点+边)
```

```bash
# 手动触发管道
curl -X POST http://localhost:3001/api/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"seeds":["https://example.edu/lab"], "maxPagesPerSeed": 5}'

# 查看管道状态
curl http://localhost:3001/api/v1/pipeline/status

# 导入种子数据
pnpm seed
```

LLM 模式：配置 `.env` 中的 `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL`。
未配置时自动使用启发式正则提取。

---

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /api/v1/search?q=&type=&country=&field=` | 分面搜索 |
| `GET /api/v1/persons/:uuid` | 人物详情 |
| `GET /api/v1/persons/:uuid/genealogy` | 学术家谱 |
| `GET /api/v1/persons/:uuid/graph` | 2 跳关系图 |
| `GET /api/v1/labs/:uuid` | 实验室详情 |
| `GET /api/v1/equipment/:uuid` | 设备详情 |
| `GET /api/v1/directions/:uuid` | 研究方向详情 |
| `POST /api/v1/pipeline/run` | 触发数据管道 |
| `POST /api/v1/pipeline/seed` | 一键导入种子数据 |
| `POST /api/v1/pipeline/enrich` | 丰富人物信息 |
| `GET /api/health` | 健康检查 |
| `GET /api/docs` | Swagger 文档 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 14 · React 18 · TailwindCSS |
| 后端 | NestJS · TypeScript |
| 图数据库 | Neo4j 5 |
| 关系数据库 | PostgreSQL 16 |
| 缓存/队列 | Redis · BullMQ |
| 爬虫 | Playwright · Crawlee |
| LLM | OpenAI Compatible API (DeepSeek) |
| 基础设施 | Docker · Nginx |

---

## 核心原则

1. **Graph Native** — Neo4j 是唯一数据真相源
2. **Relationship First** — 关系是一等公民
3. **AI Assisted, Human Verifiable** — AI 辅助，人类可验证
4. **Continuous Growth** — 图谱永不停机，持续演化

---

## 路线图

详见 [ROADMAP.md](docs/Roadmap.md)

- **V1.0** (当前) — ARPES 领域学术知识图谱
- **V1.5** — Multi-Agent 架构 · 自动爬取调度
- **V2.0** — 多学科扩展 · 工业客户关系网络

---

## 文档

- [系统架构](docs/Architecture.md)
- [图数据模型](docs/GraphSchema.md)
- [数据管道](docs/DataPipeline.md)
- [API 文档](docs/API.md)
- [产品路线图](docs/Roadmap.md)

---

Proprietary — All rights reserved.
