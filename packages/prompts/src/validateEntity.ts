// Entity validation prompt templates.

export const validateEntityPrompt = {
  system: `You are an expert validator for the ARPES knowledge graph. Your task is to verify that extracted entity information is correct, complete, and consistent with the source text.`,
  template: `Validate the following extracted entity against the source text.\n\nEntity:\n{{entity}}\n\nSource Text:\n{{sourceText}}\n\nCheck: factual accuracy, completeness, consistency. Return: isValid (boolean), issues (array of {field, severity, message}), confidence (0-1).`,
};

export const validateEntityPromptBatch = {
  ...validateEntityPrompt,
  batchSize: 20,
};
