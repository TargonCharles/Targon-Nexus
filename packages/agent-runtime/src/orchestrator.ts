// =============================================================================
// Master Agent — Pipeline 编排器
// 接收 PipelineRunRequest → 拆分 PipelineStage 任务 → 按 DAG 依赖调度
// =============================================================================

import { generateUUID } from '@arp/shared';
import type {
  IEventBus, AgentContext, AgentResult, AgentLogger,
  PipelineTask, PipelineStage, PipelineRunRequest, PipelineRunResult,
  AgentEvent,
} from './types';
import type { AgentRegistry } from './registry';

/** 管道阶段 DAG 依赖 */
const STAGE_DEPENDENCIES: Record<PipelineStage, PipelineStage[]> = {
  discovery: [],
  crawl: ['discovery'],
  parse: ['crawl'],
  extract: ['parse'],
  resolve: ['extract'],
  'build-graph': ['resolve'],
  validate: ['build-graph'],
  index: ['validate'],
};

/** 阶段对应的 Agent */
const STAGE_AGENT_MAP: Record<PipelineStage, string> = {
  discovery: 'crawler-agent',
  crawl: 'crawler-agent',
  parse: 'parser-agent',
  extract: 'extractor-agent',
  resolve: 'resolver-agent',
  'build-graph': 'graph-agent',
  validate: 'qa-agent',
  index: 'graph-agent',
};

export class PipelineOrchestrator {
  private registry: AgentRegistry;
  private eventBus: IEventBus;
  private logger: AgentLogger;

  constructor(registry: AgentRegistry, eventBus: IEventBus, logger?: AgentLogger) {
    this.registry = registry;
    this.eventBus = eventBus;
    this.logger = logger ?? {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
  }

  /**
   * 运行完整的数据管道
   */
  async run(request: PipelineRunRequest): Promise<PipelineRunResult> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();
    const errors: string[] = [];
    const completedTasks: PipelineTask[] = [];

    this.logger.info(`Pipeline [${runId}]: Starting`, { seeds: request.seeds.length });

    // 创建所有阶段的任务
    const tasks = this.createTasks(runId, request);

    // 按依赖顺序执行
    const stages = this.topologicalSort(tasks);
    this.logger.info(`Pipeline [${runId}]: ${stages.length} stages to execute`);

    for (const stage of stages) {
      const stageTasks = tasks.filter((t) => t.stage === stage && t.status === 'pending');

      // 检查依赖是否全部完成
      const depsMet = stageTasks.filter((t) =>
        t.dependencies.every((depId) => {
          const dep = tasks.find((tt) => tt.id === depId);
          return dep?.status === 'done';
        }),
      );

      if (depsMet.length === 0) {
        this.logger.warn(`Pipeline [${runId}]: Stage "${stage}" skipped — no ready tasks`);
        continue;
      }

      this.logger.info(`Pipeline [${runId}]: Executing stage "${stage}" (${depsMet.length} tasks)`);

      // 每个阶段内的任务可以并行
      const results = await Promise.allSettled(
        depsMet.map((task) => this.executeTask(task, runId)),
      );

      for (let i = 0; i < depsMet.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          depsMet[i].status = 'done';
          depsMet[i].result = result.value;
        } else {
          depsMet[i].status = 'failed';
          const errMsg = result.reason?.message || 'Unknown error';
          depsMet[i].result = { status: 'failed', error: errMsg, durationMs: 0 };
          errors.push(`[${stage}] ${errMsg}`);
        }
        depsMet[i].completedAt = new Date().toISOString();
        completedTasks.push(depsMet[i]);
      }
    }

    // 汇总统计
    const stats = this.computeStats(completedTasks, startTime);

    this.logger.info(`Pipeline [${runId}]: Complete — ${stats.nodesCreated} nodes, ${stats.relationshipsCreated} rels, ${Date.now() - startTime}ms`);

    return {
      runId,
      status: errors.length === 0 ? 'completed' : errors.length < 3 ? 'partial' : 'failed',
      tasks: completedTasks,
      stats,
      errors,
    };
  }

  /** 创建管道任务 */
  private createTasks(runId: string, request: PipelineRunRequest): PipelineTask[] {
    const now = new Date().toISOString();
    const stages: PipelineStage[] = ['discovery', 'crawl', 'parse', 'extract', 'resolve', 'build-graph', 'validate'];

    const tasks: PipelineTask[] = [];
    const prevTaskIds: string[] = [];

    for (const stage of stages) {
      const taskId = `${runId}-${stage}`;
      const task: PipelineTask = {
        id: taskId,
        type: 'pipeline-stage',
        stage,
        input: stage === 'discovery' ? request : { seeds: request.seeds },
        status: 'pending',
        assignedAgent: STAGE_AGENT_MAP[stage],
        dependencies: [...prevTaskIds],
        createdAt: now,
      };
      tasks.push(task);
      prevTaskIds.push(taskId);
    }

    return tasks;
  }

  /** 拓扑排序 */
  private topologicalSort(tasks: PipelineTask[]): PipelineStage[] {
    const stages = new Set(tasks.map((t) => t.stage));
    const stageList = Array.from(stages);

    // 按依赖数排序（无依赖的优先）
    return stageList.sort((a, b) => {
      const depsA = STAGE_DEPENDENCIES[a]?.length ?? 0;
      const depsB = STAGE_DEPENDENCIES[b]?.length ?? 0;
      return depsA - depsB;
    });
  }

  /** 执行单个任务（通过 Event Bus 通知对应的 Agent） */
  private async executeTask(task: PipelineTask, runId: string): Promise<AgentResult> {
    const start = Date.now();
    const agentName = task.assignedAgent || 'master-agent';
    const registration = this.registry.get(agentName);

    if (!registration) {
      return { status: 'failed', error: `Agent "${agentName}" not registered`, durationMs: 0 };
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();

    // 构建 Agent Context
    const ctx: AgentContext = {
      agentDef: registration.definition,
      eventBus: this.eventBus,
      logger: this.logger,
      state: new Map(Object.entries({ taskId: task.id, stage: task.stage, runId })),
    };

    // 构建事件
    const event: AgentEvent = {
      eventId: generateUUID(),
      eventType: `PipelineTask.${task.stage}`,
      timestamp: new Date().toISOString(),
      sourceAgent: 'master-agent',
      runId,
      payload: {
        taskId: task.id,
        stage: task.stage,
        input: task.input,
      },
    };

    try {
      // 调用 Agent handler
      const result = await registration.handler(ctx, event);
      result.durationMs = Date.now() - start;
      return result;
    } catch (err: any) {
      return {
        status: 'failed',
        error: err.message || 'Unknown error',
        durationMs: Date.now() - start,
      };
    }
  }

  /** 计算管道统计 */
  private computeStats(tasks: PipelineTask[], startTime: number): PipelineRunResult['stats'] {
    const stats: PipelineRunResult['stats'] = {
      pagesCrawled: 0,
      entitiesExtracted: 0,
      nodesCreated: 0,
      relationshipsCreated: 0,
      durationMs: Date.now() - startTime,
    };

    for (const task of tasks) {
      const output = task.result?.output as Record<string, unknown> | undefined;
      if (!output) continue;

      if (task.stage === 'crawl') {
        stats.pagesCrawled += (output.pagesCrawled as number) || 0;
      }
      if (task.stage === 'extract') {
        stats.entitiesExtracted += (output.entitiesExtracted as number) || 0;
      }
      if (task.stage === 'build-graph') {
        stats.nodesCreated += (output.nodesCreated as number) || 0;
        stats.relationshipsCreated += (output.relationshipsCreated as number) || 0;
      }
    }

    return stats;
  }
}
