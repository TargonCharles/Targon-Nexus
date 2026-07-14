# Targon Nexus — 产品路线图

---

## V1.0 — ARPES Knowledge Graph ✅ 当前

**主题**: ARPES 领域知识图谱 MVP

### 已完成

| 功能 | 状态 |
|------|------|
| 全文搜索 + 分面筛选（类型/国家/领域） | ✅ |
| 学术家谱树状图（导师→学生→再传） | ✅ |
| 力导向关系图谱（可点击节点跳转） | ✅ |
| 人物/实验室/设备/方向详情页 | ✅ |
| LLM 数据管道（爬取→DeepSeek 提取→Neo4j 写入） | ✅ |
| 一键导入种子数据 | ✅ |
| 深色首页 + 41 标签星环动画 | ✅ |
| 管道 API + CLI 脚本 | ✅ |
| 健康检查 + Swagger 文档 | ✅ |
| JWT 认证模块 | ✅ |

### 待完成

- [ ] 数据达标: 300 实验室, 1,000 教授, 20,000 论文
- [ ] 论文引用网络
- [ ] 设备图谱扩展 (STM, TEM, SEM, AFM, MBE 等)

### 数据现状

| 实体 | 当前 | 目标 |
|------|------|------|
| 研究人员 | 40+ | 1,000 |
| 实验室 | 20+ | 300 |
| 设备 | 30+ | 300 |
| 研究方向 | 30+ | 100 |
| 大学/机构 | 25+ | 200 |

---

## V1.5 — Multi-Agent Pipeline 📋

**主题**: AI Agent 自动化持续采集

- [ ] Master Agent: 任务拆分与调度
- [ ] Crawler Agent: 递归网页发现
- [ ] Parser Agent: HTML/PDF/OCR 解析
- [ ] Extraction Agent: LLM 实体关系提取
- [ ] Graph Agent: 写入 + 消歧 + 合并
- [ ] Search Agent: 查询扩展 + 语义搜索
- [ ] Insight Agent: 商业分析 + 推荐
- [ ] Python 爬虫 (Scrapy + Playwright)
- [ ] 向量数据库 (Qdrant)
- [ ] 混合搜索 (Graph + Vector)
- [ ] GraphQL API

---

## V2.0 — 多学科 + 工业客户

**主题**: 扩展到全学科 + 商业关系

- [ ] 多学科支持（材料/化学/光学/纳米/生物物理）
- [ ] 工业客户: Company, Patent, Project, Funding, Product
- [ ] 采购关系图谱
- [ ] 销售机会发现

---

## V3.0 — Relationship Intelligence Platform

**主题**: AI 驱动的关系智能

- [ ] 销售线索生成
- [ ] 采购预测模型
- [ ] 影响力分析
- [ ] 竞争格局
- [ ] 对话式 AI 查询
- [ ] 自动报告生成

### 最终愿景

```
Crawler → Parser → LLM → Knowledge Graph
                            ↓
                   Relationship Discovery
                            ↓
                   Continuous Update
                            ↓
                   Vector Embedding → Hybrid Search
                            ↓
                   Enterprise Intelligence Brain
```

---

## 技术路线

| 阶段 | 核心技术 |
|------|---------|
| V1.0 | Next.js · NestJS · Neo4j · DeepSeek · BullMQ |
| V1.5 | Python Scrapy · Qdrant · Multi-Agent · OCR · GraphQL |
| V2.0 | Elasticsearch · LLM Fine-tuning |
| V3.0 | ML Pipeline · Predictive Analytics · AutoML |

---

## 开发原则

- TypeScript Strict Mode
- Graph Native — Neo4j 是唯一数据真实源
- AI Assisted, Human Verifiable
- Continuous Growth — 图谱永不停机
- Relationship First — 关系是一等公民
