// =============================================================================
// Vector Service — 混合搜索（图谱 + 向量）
// 支持 OpenAI Embeddings + TF-IDF 双模式，可切换 Qdrant 向量数据库
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

/** OpenAI Embedding 维度 */
const OPENAI_EMBEDDING_DIM = 1536;

export interface HybridSearchResult {
  uuid: string;
  type: string;
  name: string;
  description?: string;
  graphScore: number;
  vectorScore: number;
  combinedScore: number;
  highlights?: string[];
}

export interface VectorDocument {
  uuid: string;
  type: string;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// 简易 TF-IDF 向量化（无需外部 API，适用于演示和离线环境）
class TfidfVectorizer {
  private vocabulary = new Map<string, number>();
  private idf = new Map<string, number>();
  private docCount = 0;

  /** 从文档集合构建词汇表 */
  fit(documents: string[]): void {
    // 构建词频
    const dfs = new Map<string, number>();
    for (const doc of documents) {
      const words = this.tokenize(doc);
      const seen = new Set<string>();
      for (const w of words) {
        if (!seen.has(w)) {
          dfs.set(w, (dfs.get(w) || 0) + 1);
          seen.add(w);
        }
      }
      this.docCount++;
    }

    // 构建 IDF
    for (const [word, df] of dfs) {
      if (!this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.vocabulary.size);
      }
      this.idf.set(word, Math.log((this.docCount + 1) / (df + 1)) + 1);
    }
  }

  /** 将文本转为 TF-IDF 向量 */
  transform(text: string): number[] {
    const words = this.tokenize(text);
    const vec = new Array(this.vocabulary.size).fill(0);
    const tf = new Map<string, number>();

    for (const w of words) {
      tf.set(w, (tf.get(w) || 0) + 1);
    }

    for (const [word, count] of tf) {
      const idx = this.vocabulary.get(word);
      if (idx !== undefined) {
        vec[idx] = (count / words.length) * (this.idf.get(word) || 1);
      }
    }

    return vec;
  }

  /** 余弦相似度 */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  }

  get dimensions(): number {
    return this.vocabulary.size;
  }
}

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);
  private vectorizer: TfidfVectorizer | null = null;
  private documentVectors = new Map<string, VectorDocument>();

  // Qdrant 配置（可选）
  private qdrantUrl: string;
  private useQdrant: boolean;

  constructor(private readonly neo4j: Neo4jService) {
    this.qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    this.useQdrant = !!process.env.QDRANT_URL;
  }

  /**
   * 从 Neo4j 图谱构建向量索引
   * 为 Person/Paper/Lab 的文本字段生成 TF-IDF 向量
   */
  async buildIndex(): Promise<{ indexed: number; dimensions: number }> {
    this.logger.log('Building vector index from knowledge graph...');

    // 收集所有实体的文本表示
    const entities = await this.neo4j.read<{
      uuid: string; type: string; name: string; description: string;
      textFields: string[];
    }>(
      `MATCH (n)
       WHERE n:Person OR n:Paper OR n:Lab OR n:Equipment OR n:ResearchDirection
       RETURN
         n.uuid AS uuid,
         labels(n)[0] AS type,
         coalesce(n.englishName, n.chineseName, n.name, n.title, '') AS name,
         coalesce(n.description, n.biography, '') AS description,
         coalesce(n.keywords, n.researchInterests, []) AS textFields`,
    );

    const documents = entities.map((e) => {
      const text = [
        e.name,
        e.description,
        ...(e.textFields || []),
      ].filter(Boolean).join(' ');
      return text;
    });

    // 构建 TF-IDF
    this.vectorizer = new TfidfVectorizer();
    this.vectorizer.fit(documents);

    // 创建文档向量
    this.documentVectors.clear();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const text = documents[i];
      const embedding = this.vectorizer.transform(text);
      this.documentVectors.set(e.uuid, {
        uuid: e.uuid,
        type: e.type.toLowerCase(),
        text,
        embedding,
        metadata: { name: e.name },
      });
    }

    this.logger.log(`Vector index built: ${this.documentVectors.size} documents, ${this.vectorizer.dimensions} dimensions`);

    return {
      indexed: this.documentVectors.size,
      dimensions: this.vectorizer.dimensions,
    };
  }

  /**
   * 混合搜索 — 图谱全文搜索 + 向量语义搜索
   */
  async hybridSearch(
    query: string,
    opts?: {
      type?: string;
      limit?: number;
      graphWeight?: number;
      vectorWeight?: number;
    },
  ): Promise<HybridSearchResult[]> {
    const limit = opts?.limit ?? 20;
    const graphWeight = opts?.graphWeight ?? 0.5;
    const vectorWeight = opts?.vectorWeight ?? 0.5;

    // 如果索引未构建，先构建
    if (!this.vectorizer || this.documentVectors.size === 0) {
      await this.buildIndex();
    }

    // Step 1: 图谱全文搜索
    const graphResults = await this.neo4j.read<{
      uuid: string; type: string; name: string; score: number;
    }>(
      `CALL db.index.fulltext.queryNodes('person_fulltext', $term) YIELD node, score
       RETURN node.uuid AS uuid, 'person' AS type,
              coalesce(node.englishName, node.chineseName) AS name, score
       UNION ALL
       CALL db.index.fulltext.queryNodes('lab_fulltext', $term) YIELD node, score
       RETURN node.uuid AS uuid, 'lab' AS type, node.name AS name, score
       UNION ALL
       CALL db.index.fulltext.queryNodes('paper_fulltext', $term) YIELD node, score
       RETURN node.uuid AS uuid, 'paper' AS type, node.title AS name, score
       ORDER BY score DESC
       LIMIT $limit`,
      { term: query, limit: limit * 2 },
    );

    // Step 2: 向量语义搜索
    const queryVec = this.vectorizer!.transform(query);
    const vectorScores: Array<{ uuid: string; score: number }> = [];

    for (const [uuid, doc] of this.documentVectors) {
      const sim = this.vectorizer!.cosineSimilarity(queryVec, doc.embedding);
      if (sim > 0.05) { // 最低相似度阈值
        vectorScores.push({ uuid, score: sim });
      }
    }
    vectorScores.sort((a, b) => b.score - a.score);

    // Step 3: 融合得分
    const graphMap = new Map<string, { type: string; name: string; score: number }>();
    const maxGraphScore = graphResults[0]?.score ?? 1;
    for (const r of graphResults) {
      graphMap.set(r.uuid, {
        type: r.type,
        name: r.name,
        score: r.score / Math.max(maxGraphScore, 1), // 归一化
      });
    }

    const vectorMap = new Map<string, number>();
    const maxVecScore = vectorScores[0]?.score ?? 1;
    for (const v of vectorScores.slice(0, limit * 2)) {
      vectorMap.set(v.uuid, v.score / Math.max(maxVecScore, 1));
    }

    // 合并 — 使用加权和的融合策略
    const combined = new Map<
      string,
      { uuid: string; type: string; name: string; graphScore: number; vectorScore: number }
    >();

    for (const [uuid, gData] of graphMap) {
      const vecScore = vectorMap.get(uuid) ?? 0;
      combined.set(uuid, {
        uuid,
        type: gData.type,
        name: gData.name,
        graphScore: gData.score,
        vectorScore: vecScore,
      });
    }

    for (const [uuid, vecScore] of vectorMap) {
      if (!combined.has(uuid)) {
        const gData = graphMap.get(uuid);
        combined.set(uuid, {
          uuid,
          type: gData?.type ?? 'unknown',
          name: gData?.name ?? '',
          graphScore: gData?.score ?? 0,
          vectorScore: vecScore,
        });
      }
    }

    // 加权融合 + 排序
    const results: HybridSearchResult[] = Array.from(combined.values())
      .map((c) => ({
        ...c,
        combinedScore: graphWeight * c.graphScore + vectorWeight * c.vectorScore,
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);

    return results;
  }

  /**
   * 通过 OpenAI Embeddings API 获取向量（可选）
   */
  async embedWithOpenAI(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 256,
      }),
    });

    if (!resp.ok) {
      throw new Error(`OpenAI Embeddings API error: ${resp.status}`);
    }

    const data: any = await resp.json();
    return data.data[0].embedding;
  }

  /**
   * Qdrant 集成 — 上传向量（可选）
   */
  async uploadToQdrant(documents: VectorDocument[]): Promise<void> {
    if (!this.useQdrant) return;

    const points = documents.map((doc, idx) => ({
      id: idx + 1,
      vector: doc.embedding,
      payload: {
        uuid: doc.uuid,
        type: doc.type,
        text: doc.text.substring(0, 1000),
        ...doc.metadata,
      },
    }));

    await fetch(`${this.qdrantUrl}/collections/targon-nexus/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
  }

  /**
   * 使用 OpenAI Embeddings 批量构建向量索引（高质量语义搜索）
   */
  async buildIndexWithOpenAI(): Promise<{ indexed: number; model: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const entities = await this.neo4j.read<{ uuid: string; type: string; name: string; description: string }>(
      `MATCH (n) WHERE n:Person OR n:Paper OR n:Lab
       RETURN n.uuid AS uuid, labels(n)[0] AS type,
              coalesce(n.englishName, n.chineseName, n.name, n.title, '') AS name,
              coalesce(n.description, n.biography, '') AS description
       LIMIT 200`,
    );

    for (const e of entities) {
      const text = `${e.type}: ${e.name}. ${e.description}`.substring(0, 8000);
      try {
        const embedding = await this.embedWithOpenAI(text);
        this.documentVectors.set(e.uuid, {
          uuid: e.uuid, type: e.type.toLowerCase(), text,
          embedding, metadata: { name: e.name },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to embed ${e.uuid}: ${err.message}`);
      }
    }

    this.logger.log(`OpenAI embedding index built: ${this.documentVectors.size} documents`);
    return { indexed: this.documentVectors.size, model: 'text-embedding-3-small' };
  }

  /**
   * 纯语义搜索 — 仅使用向量相似度（不混合图谱分数）
   */
  async semanticSearch(query: string, limit = 10): Promise<HybridSearchResult[]> {
    if (this.documentVectors.size === 0) {
      throw new Error('Vector index not built. Call buildIndex() or buildIndexWithOpenAI() first.');
    }

    this.vectorizer = new TfidfVectorizer();
    const queryVec = this.vectorizer.transform(query);
    const scores: Array<{ uuid: string; score: number; doc: VectorDocument }> = [];

    for (const [uuid, doc] of this.documentVectors) {
      const sim = this.vectorizer.cosineSimilarity(queryVec, doc.embedding);
      if (sim > 0.05) scores.push({ uuid, score: sim, doc });
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({
        uuid: s.uuid,
        type: s.doc.type,
        name: (s.doc.metadata?.name as string) || s.doc.text.substring(0, 50),
        graphScore: 0,
        vectorScore: s.score,
        combinedScore: s.score,
      }));
  }
}
