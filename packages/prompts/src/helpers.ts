// Prompt construction helpers — template engine, token estimation, etc.

export interface PromptTemplate {
  system?: string;
  template: string;
}

export interface PromptVariable {
  name: string;
  description: string;
  required: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StructuredPrompt {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
}

/**
 * Substitute `{{variable}}` placeholders in a template string.
 */
export function buildPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/**
 * Build a chat-completion messages array from a PromptTemplate and variables.
 */
export function buildChatMessages(
  prompt: PromptTemplate,
  variables: Record<string, string>,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (prompt.system) {
    messages.push({ role: 'system', content: prompt.system });
  }
  messages.push({ role: 'user', content: buildPrompt(prompt.template, variables) });
  return messages;
}

/**
 * Build a structured (system + user) prompt pair.
 */
export function buildStructuredPrompt(
  system: string,
  userTemplate: string,
  variables: Record<string, string>,
): StructuredPrompt {
  return {
    system,
    user: buildPrompt(userTemplate, variables),
  };
}

/**
 * Merge a domain-specific system prompt with a task-specific system prompt.
 */
export function mergeSystemPrompt(
  domainPrompt: string,
  taskPrompt: string,
): string {
  return [domainPrompt, '', taskPrompt].join('\n');
}

/**
 * Rough token count estimate (4 chars ≈ 1 token for English text).
 * For production use, integrate a proper tokenizer (tiktoken, gpt-tokenizer).
 */
export function estimateTokenCount(text: string): number {
  // Conservative estimate: 3.5 chars per token for mixed Chinese/English
  const latinChars = (text.match(/[a-zA-Z0-9\s.,!?'"\-()]/g) || []).length;
  const cjkChars = text.length - latinChars;
  return Math.ceil(latinChars / 4 + cjkChars / 1.5);
}
