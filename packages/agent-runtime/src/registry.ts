// =============================================================================
// Agent Registry — 从 agents/*/agent.yaml 加载 Agent 定义
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { AgentDefinition, AgentHandler, AgentRegistration } from './types';

export class AgentRegistry {
  private agents: Map<string, AgentRegistration> = new Map();

  /** 注册一个 Agent */
  register(registration: AgentRegistration): void {
    if (this.agents.has(registration.definition.name)) {
      throw new Error(`Agent "${registration.definition.name}" already registered`);
    }
    this.agents.set(registration.definition.name, registration);
  }

  /** 注册多个 Agent */
  registerAll(registrations: AgentRegistration[]): void {
    for (const reg of registrations) {
      this.register(reg);
    }
  }

  /** 获取 Agent */
  get(name: string): AgentRegistration | undefined {
    return this.agents.get(name);
  }

  /** 列出所有 Agent */
  list(): AgentDefinition[] {
    return Array.from(this.agents.values()).map((r) => r.definition);
  }

  /** 列出所有 Agent 名称 */
  listNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /** Agent 总数 */
  get count(): number {
    return this.agents.size;
  }
}

/**
 * 从 agents/ 目录加载 YAML 定义（简易解析器，不依赖 yaml 库）
 * 仅支持 agent.yaml 的顶层结构解析
 */
export function loadAgentDefinitions(agentsDir: string): AgentDefinition[] {
  const definitions: AgentDefinition[] = [];

  if (!fs.existsSync(agentsDir)) {
    return definitions;
  }

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const yamlPath = path.join(agentsDir, entry.name, 'agent.yaml');
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const def = parseAgentYaml(content);
      if (def) {
        definitions.push(def);
      }
    } catch (err) {
      console.warn(`Warning: Failed to load agent definition from ${yamlPath}`);
    }
  }

  return definitions;
}

/**
 * 从 agents/ 目录加载 Agent 的 prompt.md 文件
 */
export function loadAgentPrompt(agentsDir: string, agentName: string): string | null {
  const promptPath = path.join(agentsDir, agentName, 'prompt.md');
  if (!fs.existsSync(promptPath)) return null;
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    return null;
  }
}

/** 简易 YAML 解析 — 只解析 agent.yaml 所需的结构 */
function parseAgentYaml(content: string): AgentDefinition | null {
  const nameMatch = content.match(/^\s*name:\s*(.+?)\s*$/m);
  const versionMatch = content.match(/version:\s*(.+?)\s*$/m);
  const descMatch = content.match(/description:\s*>\s*\n\s*(.+?)(?:\n|$)/m) ||
                    content.match(/description:\s*(.+?)\s*$/m);
  const kindMatch = content.match(/kind:\s*(.+?)\s*$/m);

  if (!nameMatch || !versionMatch) return null;

  // 解析 triggers
  const triggers: AgentDefinition['events']['triggers'] = [];
  const triggerSection = content.match(/triggers:[\s\S]*?(?=\n\s{2}\w|\n\w|$)/);
  if (triggerSection) {
    const triggerEntries = triggerSection[0].matchAll(/- (\w+):/g);
    for (const match of triggerEntries) {
      triggers.push({
        event: match[1],
        description: '',
        handler: `handle_${match[1].toLowerCase()}`,
      });
    }
  }

  // 解析 actions
  const actions: AgentDefinition['events']['actions'] = [];
  const actionSection = content.match(/actions:[\s\S]*?(?=\n\s{2}\w|\n\w|$)/);
  if (actionSection) {
    const actionEntries = actionSection[0].matchAll(/- (\w+):/g);
    for (const match of actionEntries) {
      actions.push({
        name: match[1],
        description: '',
        input: {},
        output: {},
      });
    }
  }

  // 解析 emits
  const emits: AgentDefinition['events']['emits'] = [];
  const emitSection = content.match(/emits:[\s\S]*?(?=\n\s{2}\w|\n\w|$)/);
  if (emitSection) {
    const emitEntries = emitSection[0].matchAll(/- (\w+):/g);
    for (const match of emitEntries) {
      emits.push({
        event: match[1],
        description: '',
      });
    }
  }

  return {
    name: nameMatch[1].trim(),
    version: versionMatch[1].trim(),
    description: descMatch?.[1]?.trim() || '',
    kind: (kindMatch?.[1]?.trim() as AgentDefinition['kind']) || 'stateless-event-driven',
    events: { triggers, actions, emits },
  };
}
