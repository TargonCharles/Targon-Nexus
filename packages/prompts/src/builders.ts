// Prompt builder functions — compose system + user prompts for the
// extraction pipeline. Used by the extractor service to construct
// LLM calls for entity extraction, relationship inference, and
// identity resolution.

import { EntityType } from "@arp/types";
import type { ExtractedEntity } from "@arp/types";
import { systemPrompt } from "./system";

// ---------------------------------------------------------------------------
// Entity extraction builder
// ---------------------------------------------------------------------------

export interface BuilderPrompt {
  system: string;
  user: (...args: any[]) => string;
}

/**
 * Build a prompt for extracting entities of the given types from a text chunk.
 */
export function buildEntityExtractionPrompt(
  entityTypes: EntityType[],
): BuilderPrompt {
  const typeList = entityTypes.join(", ");
  const system = [
    systemPrompt,
    "",
    `You are an expert entity extractor for the ARPES research community knowledge graph.`,
    `Extract all entities of the following types from the provided text: ${typeList}.`,
    "",
    `For each entity, provide:`,
    `- name: the canonical name`,
    `- type: one of [${typeList}]`,
    `- description: a brief description from the text`,
    `- aliases: any alternative names found`,
    `- affiliations: institutional affiliations (for Person)`,
    `- email: email if present`,
    `- institution: host institution`,
    `- orcid: ORCID identifier if present`,
    `- url: relevant URL if present`,
    `- confidence: 0.0-1.0 based on how clearly the entity is described`,
    "",
    `Return ONLY a JSON object: { "entities": [...] }`,
  ].join("\n");

  return {
    system,
    user: (chunk: string, sourceUrl: string) =>
      `Source URL: ${sourceUrl}\n\nText:\n${chunk}`,
  };
}

// ---------------------------------------------------------------------------
// Relationship extraction builder
// ---------------------------------------------------------------------------

export function buildRelationshipExtractionPrompt(): BuilderPrompt {
  const system = [
    systemPrompt,
    "",
    `You are an expert relationship extractor for the ARPES research community knowledge graph.`,
    `Given a text passage and a list of known entities, infer relationships between them.`,
    "",
    `Valid relationship types:`,
    `- STUDENT_OF: person A studied under person B`,
    `- ADVISOR_OF: person A is/was the advisor of person B`,
    `- MEMBER_OF: person is a member of a lab`,
    `- ALUMNI_OF: person was formerly a member of a lab`,
    `- COLLABORATES_WITH: lab A collaborates with lab B`,
    `- COAUTHOR_WITH: person A co-authored with person B`,
    `- HAS_EQUIPMENT: lab has a piece of equipment`,
    `- RESEARCHES_ON: person/lab researches a direction`,
    `- BELONGS_TO: lab/school belongs to a university`,
    `- WORKS_AT: person works at a company/institution`,
    `- PART_OF: entity is part of a larger entity`,
    `- PUBLISHED: person published a paper`,
    "",
    `For each relationship, provide:`,
    `- type: the relationship type (use snake_case)`,
    `- sourceEntityId: name of the source entity`,
    `- targetEntityId: name of the target entity`,
    `- confidence: 0.0-1.0`,
    `- evidence: supporting excerpt from the text`,
    `- description: brief description`,
    "",
    `Return ONLY a JSON object: { "relationships": [...] }`,
  ].join("\n");

  return {
    system,
    user: (
      chunk: string,
      entities: { id: string; type: string }[],
      sourceUrl: string,
    ) =>
      [
        `Source URL: ${sourceUrl}`,
        "",
        `Known entities:`,
        ...entities.map((e) => `- [${e.type}] ${e.id}`),
        "",
        `Text:`,
        chunk,
      ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Entity resolution builder
// ---------------------------------------------------------------------------

export function buildEntityResolutionPrompt(
  entityType: EntityType,
): BuilderPrompt {
  const system = [
    systemPrompt,
    "",
    `You are an expert identity resolver for the ARPES research community knowledge graph.`,
    `Given a list of ${entityType} entities that may contain duplicates, merge entities that refer to the same real-world ${entityType}.`,
    "",
    `Merge criteria for ${entityType}:`,
    entityType === EntityType.Person
      ? [
          `- Same or similar name (allow minor spelling variations)`,
          `- Same email`,
          `- Same ORCID`,
          `- Same institutional affiliation`,
        ].join("\n")
      : entityType === EntityType.Lab
        ? [
            `- Same or similar name`,
            `- Same institution`,
            `- Same website URL`,
          ].join("\n")
        : `- Same or similar name`,
    "",
    `For each group of duplicates, create ONE merged entity that:`,
    `- Keeps the most complete name`,
    `- Combines all aliases (deduplicated)`,
    `- Combines all affiliations (deduplicated)`,
    `- Takes the highest confidence score`,
    `- Takes the most complete description`,
    "",
    `Return ONLY a JSON object: { "resolved": [...] }`,
    `Include non-duplicate entities as-is in the resolved array.`,
  ].join("\n");

  return {
    system,
    user: (group: ExtractedEntity[]) =>
      [
        `Resolve the following ${entityType} entities:`,
        "",
        ...group.map(
          (e, i) =>
            `[${i}] name="${e.name}", aliases=[${(e.aliases ?? []).join(", ")}], affiliations=[${(e.affiliations ?? []).join(", ")}], email="${e.email ?? ""}", orcid="${e.orcid ?? ""}", url="${e.url ?? ""}", confidence=${e.confidence ?? 0}`,
        ),
      ].join("\n"),
  };
}
