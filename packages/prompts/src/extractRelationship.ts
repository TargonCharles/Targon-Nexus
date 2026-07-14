// Relationship extraction prompt templates.

export const extractRelationshipPrompt = {
  system: `You are an expert at inferring relationships between academic entities from text.
Focus on ARPES research community: advisor-student, lab membership, collaboration, co-authorship.`,
  template: `Given the following text and list of known entities, infer relationships between them.\n\nKnown entities:\n{{entities}}\n\nValid relationship types:\n- STUDENT_OF, ADVISOR_OF, MEMBER_OF, ALUMNI_OF\n- COLLABORATES_WITH, COAUTHOR_WITH\n- HAS_EQUIPMENT, RESEARCHES_ON, BELONGS_TO, WORKS_AT\n\nText:\n{{text}}\n\nReturn each relationship as: sourceEntityName | relationshipType | targetEntityName | confidence | evidence excerpt`,
};

export const extractRelationshipPromptBatch = {
  ...extractRelationshipPrompt,
  batchSize: 20,
};
