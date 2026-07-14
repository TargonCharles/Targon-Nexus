// Prompt registry — version-controlled catalogue of all LLM prompt templates
// used across the Targon Nexus pipeline.

import type { PromptTemplate } from './helpers';

export interface PromptEntry {
  name: string;
  version: string;
  description: string;
  prompt: PromptTemplate;
  tags: string[];
}

export interface PromptRegistry {
  prompts: Map<string, PromptEntry>;
}

function createRegistry(): PromptRegistry {
  return { prompts: new Map() };
}

export const promptRegistry = createRegistry();

/**
 * Register a prompt template in the global registry.
 */
function register(entry: PromptEntry): void {
  promptRegistry.prompts.set(entry.name, entry);
}

/**
 * Get a prompt template by name. Returns the latest version.
 */
export function getPrompt(name: string): PromptTemplate | undefined {
  return promptRegistry.prompts.get(name)?.prompt;
}

/**
 * Get a specific version of a prompt template.
 */
export function getPromptVersion(
  name: string,
  _version: string,
): PromptTemplate | undefined {
  // Current implementation only stores latest; versioning is a future feature.
  return getPrompt(name);
}

/**
 * List all registered prompt names and versions.
 */
export function listPrompts(): Array<{ name: string; version: string; tags: string[] }> {
  return Array.from(promptRegistry.prompts.values()).map((e) => ({
    name: e.name,
    version: e.version,
    tags: e.tags,
  }));
}

// -- Auto-register prompts on module load ----------------------------------
// Import and register all prompt modules so listPrompts() is useful.

import { extractPersonPrompt } from './extractPerson';
import { extractLabPrompt } from './extractLab';
import { extractEquipmentPrompt } from './extractEquipment';
import { extractResearchDirectionPrompt } from './extractResearchDirection';
import { extractRelationshipPrompt } from './extractRelationship';
import { resolveIdentityPrompt } from './resolveIdentity';
import { validateEntityPrompt } from './validateEntity';

register({
  name: 'extractPerson',
  version: '1.0.0',
  description: 'Extract Person entities from academic web pages',
  prompt: extractPersonPrompt,
  tags: ['extraction', 'person'],
});

register({
  name: 'extractLab',
  version: '1.0.0',
  description: 'Extract Lab entities from academic web pages',
  prompt: extractLabPrompt,
  tags: ['extraction', 'lab'],
});

register({
  name: 'extractEquipment',
  version: '1.0.0',
  description: 'Extract Equipment entities from academic web pages',
  prompt: extractEquipmentPrompt,
  tags: ['extraction', 'equipment'],
});

register({
  name: 'extractResearchDirection',
  version: '1.0.0',
  description: 'Extract Research Direction entities from academic web pages',
  prompt: extractResearchDirectionPrompt,
  tags: ['extraction', 'research-direction'],
});

register({
  name: 'extractRelationship',
  version: '1.0.0',
  description: 'Infer relationships between known entities from text',
  prompt: extractRelationshipPrompt,
  tags: ['extraction', 'relationship'],
});

register({
  name: 'resolveIdentity',
  version: '1.0.0',
  description: 'Resolve duplicate entity identities',
  prompt: resolveIdentityPrompt,
  tags: ['resolution', 'dedup'],
});

register({
  name: 'validateEntity',
  version: '1.0.0',
  description: 'Validate extracted entity correctness against source',
  prompt: validateEntityPrompt,
  tags: ['validation', 'quality'],
});
