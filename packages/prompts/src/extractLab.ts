// Lab entity extraction prompt templates.

export const extractLabPrompt = {
  system: `You are an expert at extracting Lab entities from academic web pages.
Focus on condensed-matter physics and ARPES research groups.`,
  template: `Extract all Lab entities from the following text. For each lab, provide:\n- name\n- englishName\n- abbreviation\n- description\n- keywords (array)\n- institution\n- country\n- city\n- website\n\nText:\n{{text}}`,
};

export const extractLabPromptStructured = {
  ...extractLabPrompt,
  outputFormat: 'json' as const,
  schema: {
    type: 'object',
    properties: {
      labs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            englishName: { type: 'string' },
            abbreviation: { type: 'string' },
            description: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            institution: { type: 'string' },
            country: { type: 'string' },
            city: { type: 'string' },
            website: { type: 'string' },
          },
        },
      },
    },
  },
};
