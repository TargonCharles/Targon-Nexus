// ===========================================================================
// 自测脚本 — 50 轮迭代测试 + 图谱填充
//
// 用法: npx ts-node scripts/self-test.ts
// ===========================================================================

import 'reflect-metadata';

// 最小化 NestJS 启动 (仅加载需要的模块)
async function testRound(keyword: string): Promise<any> {
  const url = `http://localhost:3001/api/v1/search/enrich?q=${encodeURIComponent(keyword)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data: any = await resp.json();
  const e = data?.enriched ?? {};
  return {
    keyword,
    papers: e.papersAnalyzed ?? 0,
    entities: e.entities?.length ?? 0,
    relations: e.relations?.length ?? 0,
    durationMs: e.durationMs ?? 0,
    success: (e.papersAnalyzed ?? 0) > 0,
  };
}

const KEYWORDS = [
  'angle-resolved photoemission',
  'topological insulator',
  'quantum computing',
  'high temperature superconductor',
  'CRISPR gene editing',
  'graphene',
  'perovskite solar cell',
  'spin liquid',
  'Weyl semimetal',
  'Mott insulator',
  'machine learning materials',
  'two-dimensional materials',
  'molecular beam epitaxy',
  'quantum spin hall effect',
  'heavy fermion',
  'iron-based superconductor',
  'charge density wave',
  'kagome metal',
  'transition metal dichalcogenide',
  'topological superconductor',
  'ARPES',
  'angle resolved photoemission spectroscopy',
];

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Targon Nexus — 自测 50 轮         ║');
  console.log('╚══════════════════════════════════════╝\n');

  let totalPapers = 0;
  let totalEntities = 0;
  let totalRelations = 0;
  let successCount = 0;
  let totalDuration = 0;

  for (let round = 0; round < 50; round++) {
    const kw = KEYWORDS[round % KEYWORDS.length];
    const nth = round % KEYWORDS.length === 0 ? ` (循环#${Math.floor(round / KEYWORDS.length) + 1})` : '';

    const result = await testRound(kw);
    totalPapers += result.papers;
    totalEntities += result.entities;
    totalRelations += result.relations;
    totalDuration += result.durationMs;
    if (result.success) successCount++;

    const status = result.success ? '✅' : '❌';
    console.log(`[${String(round + 1).padStart(2)}] ${status} ${kw.padEnd(35)} papers=${String(result.papers).padStart(2)} entities=${String(result.entities).padStart(3)} ${result.durationMs}ms${nth}`);

    // 轮间延迟
    if (result.success) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      await new Promise(r => setTimeout(r, 5000)); // 失败时多等一会
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(` 总计: ${successCount}/50 成功`);
  console.log(` 论文: ${totalPapers} | 实体: ${totalEntities} | 关系: ${totalRelations}`);
  console.log(` 平均耗时: ${Math.round(totalDuration / 50)}ms`);
  console.log(`═══════════════════════════════════════`);
}

main().catch(console.error);
