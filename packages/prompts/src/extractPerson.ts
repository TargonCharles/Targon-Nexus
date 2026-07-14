// Person entity extraction prompt templates.

export const extractPersonPrompt = {
  system: `You are an expert at extracting Person entities from academic web pages.
Focus on researchers in the ARPES (Angle-Resolved Photoemission Spectroscopy) community.
Extract: name (English and Chinese), title, email, ORCID, research interests, and institutional affiliation.`,
  template: `Extract all Person entities from the following text. For each person, provide:\n- englishName\n- chineseName (if present)\n- currentStatus (e.g. Professor, Postdoc, PhD Student)\n- email\n- orcid\n- researchInterests (as an array)\n- institution\n\nText:\n{{text}}`,
};

export const extractPersonPromptStructured = {
  ...extractPersonPrompt,
  outputFormat: 'json' as const,
  schema: {
    type: 'object',
    properties: {
      people: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            englishName: { type: 'string' },
            chineseName: { type: 'string' },
            currentStatus: { type: 'string' },
            email: { type: 'string' },
            orcid: { type: 'string' },
            researchInterests: { type: 'array', items: { type: 'string' } },
            institution: { type: 'string' },
          },
        },
      },
    },
  },
};
