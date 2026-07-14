// =============================================================================
// Agent CLI — 管理和运行 Agent
//   npx ts-node scripts/agent.ts list
//   npx ts-node scripts/agent.ts run --pipeline
// =============================================================================

import * as path from 'path';
import { EventBus } from '../packages/agent-runtime/src/event-bus';
import { AgentRegistry, loadAgentDefinitions } from '../packages/agent-runtime/src/registry';
import { PipelineOrchestrator } from '../packages/agent-runtime/src/orchestrator';
import {
  masterAgentHandler,
  crawlerAgentHandler,
  extractorAgentHandler,
  graphAgentHandler,
} from '../packages/agent-runtime/src/agents';

const command = process.argv[2];

const logger = {
  info: (msg: string, meta?: any) => console.log(`  ℹ ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg: string, meta?: any) => console.warn(`  ⚠ ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg: string, meta?: any) => console.error(`  ❌ ${msg}`, meta ? JSON.stringify(meta) : ''),
  debug: (msg: string, meta?: any) => console.debug(`  🔍 ${msg}`, meta ? JSON.stringify(meta) : ''),
};

async function main() {
  const eventBus = new EventBus(logger);
  const registry = new AgentRegistry();

  // 注册所有 Agent
  const agentsDir = path.resolve(__dirname, '../agents');
  const definitions = loadAgentDefinitions(agentsDir);

  // 注册 Master Agent
  registry.register({
    definition: {
      name: 'master-agent',
      version: '1.0.0',
      description: 'Pipeline orchestrator — task splitting and routing',
      kind: 'stateless-event-driven',
      events: { triggers: [], actions: [], emits: [] },
    },
    handler: masterAgentHandler,
  });

  // 注册从 agents/ 加载的 Agent
  for (const def of definitions) {
    // 根据定义名称匹配到对应的真实 handler
    let handler = null;
    switch (def.name) {
      case 'crawler-agent':
        handler = crawlerAgentHandler;
        break;
      case 'parser-agent':
        handler = extractorAgentHandler; // parser + extractor 共用一个 handler
        break;
      case 'graph-agent':
        handler = graphAgentHandler;
        break;
      default:
        // 其他 Agent 使用 Master Agent 作为通用 handler
        handler = async (_ctx: any, _event: any) => ({
          status: 'completed',
          output: { stub: true, note: `Agent ${def.name} — full implementation pending` },
          durationMs: 0,
        });
    }
    registry.register({
      definition: def,
      handler,
    });
  }

  switch (command) {
    case 'list': {
      console.log('\n  📋 已注册 Agent:\n');
      for (const def of registry.list()) {
        const triggers = def.events.triggers.map((t) => t.event).join(', ') || '—';
        const actions = def.events.actions.map((a) => a.name).join(', ') || '—';
        const emissions = def.events.emits.map((e) => e.event).join(', ') || '—';
        console.log(`  🤖 ${def.name} v${def.version}`);
        console.log(`     Desc: ${def.description}`);
        console.log(`     Triggers: ${triggers}`);
        console.log(`     Actions: ${actions}`);
        console.log(`     Emits: ${emissions}\n`);
      }
      console.log(`  总计: ${registry.count} Agent(s)\n`);
      break;
    }

    case 'run': {
      console.log('\n  🚀 运行 Agent Pipeline...\n');

      const orchestrator = new PipelineOrchestrator(registry, eventBus, logger);

      const result = await orchestrator.run({
        seeds: [
          'https://physics.stanford.edu/research/condensed-matter-physics',
          'https://phas.ubc.ca/quantum-matter',
          'https://www.iop.cas.cn/research/arpes',
        ],
        sourceType: 'lab-homepage',
        maxPagesPerSeed: 3,
        depth: 1,
      });

      console.log(`\n  Run ID: ${result.runId}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Tasks: ${result.tasks.length}`);
      console.log(`  Stats: ${JSON.stringify(result.stats)}`);
      if (result.errors.length > 0) {
        console.log(`  Errors:\n    ${result.errors.join('\n    ')}`);
      }
      console.log('');
      break;
    }

    default:
      console.log(`
  Targon Nexus — Agent CLI

  用法:
    npx ts-node scripts/agent.ts list    列出所有 Agent
    npx ts-node scripts/agent.ts run     运行一条管道（演示）
  `);
      break;
  }
}

main().catch((err) => {
  console.error('CLI Error:', err);
  process.exit(1);
});
