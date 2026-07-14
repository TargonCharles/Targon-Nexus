// ResearchDirection entity extraction prompt templates.

export const extractResearchDirectionPrompt = {
  system: `You are an expert at extracting Research Direction entities from academic web pages.
Focus on condensed-matter physics subfields relevant to ARPES.`,
  template: `Extract all Research Direction entities from the following text. For each, provide:\n- name\n- description\n- parentDirection (broader field this belongs to, if discernible)\n- keywords (array)\n\nText:\n{{text}}`,
};

export const extractResearchDirectionPromptStructured = {
  ...extractResearchDirectionPrompt,
  outputFormat: 'json' as const,
  schema: {
    type: 'object',
    properties: {
      directions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            parentDirection: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};
