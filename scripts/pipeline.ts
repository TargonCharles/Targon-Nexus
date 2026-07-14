#!/usr/bin/env npx ts-node
// ===========================================================================
// ARP 数据管道 — 手动触发
// ===========================================================================
// 从种子 URL 开始，自动爬取 → 提取实体关系 → 写入 Neo4j 知识图谱。
//
// 用法:
//   npx ts-node scripts/pipeline.ts <url>
//   npx ts-node scripts/pipeline.ts --seed https://physics.stanford.edu/...
//   npx ts-node scripts/pipeline.ts --arxiv "topological insulator ARPES"
//   npx ts-node scripts/pipeline.ts --list  (查看可用种子)
// ===========================================================================

import { runPipeline, PipelineResult } from '../packages/shared/src/pipeline';

// ---------------------------------------------------------------------------
// 预设种子 URL — ARPES 领域知名实验室和研究人员主页
// ---------------------------------------------------------------------------
const PRESET_SEEDS: Record<string, { urls: string[]; type: 'lab-homepage' | 'personal-homepage' | 'arxiv' | 'custom' }> = {
  shen: {
    urls: ['https://physics.stanford.edu/people/faculty/zhi-xun-shen'],
    type: 'personal-homepage',
  },
  damascelli: {
    urls: ['https://phas.ubc.ca/users/andrea-damascelli'],
    type: 'personal-homepage',
  },
  stanford: {
    urls: ['https://physics.stanford.edu/research/condensed-matter-physics'],
    type: 'custom',
  },
  arxiv: {
    urls: [
      'topological insulator ARPES',
      'high temperature superconductor photoemission',
      'quantum materials angle-resolved',
    ],
    type: 'arxiv',
  },
};

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.includes('-l')) {
    console.log('可用种子:');
    for (const [name, seed] of Object.entries(PRESET_SEEDS)) {
      console.log(`  ${name}: ${seed.urls.join(', ')} (${seed.type})`);
    }
    return;
  }

  let seeds: string[];
  let sourceType: 'lab-homepage' | 'personal-homepage' | 'arxiv' | 'custom' = 'custom';

  if (args.includes('--arxiv')) {
    const idx = args.indexOf('--arxiv');
    seeds = [args[idx + 1] ?? 'ARPES'];
    sourceType = 'arxiv';
  } else if (args.includes('--seed')) {
    const idx = args.indexOf('--seed');
    seeds = [args[idx + 1] ?? 'https://physics.stanford.edu/'];
  } else if (args[0] && PRESET_SEEDS[args[0]]) {
    const preset = PRESET_SEEDS[args[0]];
    seeds = preset.urls;
    sourceType = preset.type;
  } else if (args[0]) {
    seeds = [args[0]];
  } else {
    // 默认：爬取 Stanford 凝聚态物理页面
    console.log('未指定种子，使用默认: Stanford 凝聚态物理');
    seeds = ['https://physics.stanford.edu/research/condensed-matter-physics'];
  }

  console.log('═'.repeat(60));
  console.log('ARP 数据管道');
  console.log('═'.repeat(60));
  console.log(`种子: ${seeds.join(', ')}`);
  console.log(`类型: ${sourceType}`);
  console.log(`LLM: ${process.env.LLM_MODEL ?? '启发式模式（未配置 LLM）'}`);
  console.log('');

  const result = await runPipeline(
    { seeds, sourceType, maxPagesPerSeed: 3, depth: 1 },
    (progress) => {
      const bar = '█'.repeat(Math.floor(progress.percent / 5)) + '░'.repeat(20 - Math.floor(progress.percent / 5));
      process.stdout.write(`\r[${bar}] ${progress.percent}% ${progress.message}`);
      if (progress.percent >= 100) process.stdout.write('\n');
    },
  );

  console.log('');
  console.log('═'.repeat(60));
  console.log('管道完成');
  console.log('═'.repeat(60));
  console.log(`状态:     ${result.status}`);
  console.log(`耗时:     ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`爬取:     ${result.pagesCrawled} 页`);
  console.log(`实体:     ${result.entitiesExtracted} 个`);
  console.log(`关系:     ${result.relationshipsExtracted} 条`);
  console.log(`写入:     ${result.nodesCreated} 节点, ${result.relationshipsCreated} 边`);
  if (result.errors.length > 0) {
    console.log(`错误:     ${result.errors.join('; ')}`);
  }

  console.log('');
  console.log('现在打开 http://localhost:3000/search 搜索新导入的数据');
}

main().catch((err) => {
  console.error('管道失败:', err.message);
  process.exit(1);
});
