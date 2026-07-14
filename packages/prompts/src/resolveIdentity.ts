// Identity resolution prompt templates.

export const resolveIdentityPrompt = {
  system: `You are an expert at resolving duplicate entity identities in academic knowledge graphs.
Your task is to determine whether two entity records refer to the same real-world person, lab, or institution.`,
  template: `Compare the following entity records and determine if they refer to the same real-world entity.\n\nEntity A:\n{{entityA}}\n\nEntity B:\n{{entityB}}\n\nConsider: name similarity, institution, email, ORCID, research interests. Return: isMatch (boolean), confidence (0-1), reasoning (string).`,
};

export const resolveIdentityPromptBatch = {
  ...resolveIdentityPrompt,
  batchSize: 50,
};
