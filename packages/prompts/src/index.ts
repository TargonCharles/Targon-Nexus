// ---------------------------------------------------------------------------
// ARP Prompts — barrel export
// ---------------------------------------------------------------------------
// Version-controlled LLM prompt templates used throughout the Targon Nexus pipeline
// for entity extraction, relationship inference, identity resolution, and
// entity validation. All prompts include ARPES-domain context to ground the
// model in condensed-matter physics / angle-resolved photoemission terminology.
//
// Prompt catalogue:
//   extractPersonPrompt            – Extract Person entities from a passage
//   extractLabPrompt               – Extract Lab entities from a passage
//   extractEquipmentPrompt         – Extract Equipment entities from a passage
//   extractResearchDirectionPrompt – Extract ResearchDirection entities
//   extractRelationshipPrompt      – Infer relationships between entities
//   resolveIdentityPrompt          – Disambiguate / merge identity candidates
//   validateEntityPrompt           – Validate extracted entity correctness
//   systemPrompt                   – ARPES-domain system prompt (prepended)
// ---------------------------------------------------------------------------

// -- Prompts ------------------------------------------------------------------

export {
  extractPersonPrompt,
  extractPersonPromptStructured,
} from "./extractPerson";

export {
  extractLabPrompt,
  extractLabPromptStructured,
} from "./extractLab";

export {
  extractEquipmentPrompt,
  extractEquipmentPromptStructured,
} from "./extractEquipment";

export {
  extractResearchDirectionPrompt,
  extractResearchDirectionPromptStructured,
} from "./extractResearchDirection";

export {
  extractRelationshipPrompt,
  extractRelationshipPromptBatch,
} from "./extractRelationship";

export {
  resolveIdentityPrompt,
  resolveIdentityPromptBatch,
} from "./resolveIdentity";

export {
  validateEntityPrompt,
  validateEntityPromptBatch,
} from "./validateEntity";

// -- System prompt (ARPES domain context) -------------------------------------

export { systemPrompt, arpesDomainContext } from "./system";

// -- Prompt builders (for extractor pipeline) ---------------------------------

export {
  buildEntityExtractionPrompt,
  buildRelationshipExtractionPrompt,
  buildEntityResolutionPrompt,
} from "./builders";
export type { BuilderPrompt } from "./builders";

// -- Prompt helpers -----------------------------------------------------------

export {
  buildPrompt,
  buildChatMessages,
  buildStructuredPrompt,
  mergeSystemPrompt,
  estimateTokenCount,
} from "./helpers";

export type {
  PromptTemplate,
  PromptVariable,
  ChatMessage,
  StructuredPrompt,
} from "./helpers";

// -- Prompt versioning & registry --------------------------------------------

export {
  promptRegistry,
  getPrompt,
  getPromptVersion,
  listPrompts,
} from "./registry";

export type { PromptEntry, PromptRegistry } from "./registry";
