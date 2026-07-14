// Equipment entity extraction prompt templates.

export const extractEquipmentPrompt = {
  system: `You are an expert at extracting scientific Equipment entities from academic web pages.
Focus on ARPES-related instruments: analyzers, MBE chambers, lasers, cryostats, synchrotron beamlines.`,
  template: `Extract all Equipment entities from the following text. For each, provide:\n- name\n- category (ARPES, MBE, STM, XRD, Laser, Cryostat, etc.)\n- brand/manufacturer\n- model\n- specifications (key-value pairs)\n- labName (which lab owns it)\n\nText:\n{{text}}`,
};

export const extractEquipmentPromptStructured = {
  ...extractEquipmentPrompt,
  outputFormat: 'json' as const,
  schema: {
    type: 'object',
    properties: {
      equipment: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            brand: { type: 'string' },
            model: { type: 'string' },
            specifications: { type: 'object' },
            labName: { type: 'string' },
          },
        },
      },
    },
  },
};
