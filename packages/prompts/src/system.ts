// ARPES-domain system prompt — provides context for LLM extraction tasks.
// Prepended to all extraction/resolution prompts to ground the model in
// condensed-matter physics and angle-resolved photoemission spectroscopy.

export const arpesDomainContext = `
You are working with data from the ARPES (Angle-Resolved Photoemission Spectroscopy)
research community — a subfield of condensed-matter physics. Key concepts include:

- ARPES: An experimental technique using the photoelectric effect to map the
  electronic band structure of materials. Synchrotron radiation sources,
  hemispherical analyzers, and ultra-high vacuum are standard.
- Common research topics: topological materials, high-temperature
  superconductors (cuprates, iron-based), quantum materials, strongly
  correlated electron systems, charge density waves, 2D materials (graphene,
  transition metal dichalcogenides), Weyl/Dirac semimetals.
- Institutions: typically university physics departments, national labs
  (synchrotron facilities like ALS, SSRL, BESSY, Diamond, SPring-8).
- Equipment: Scienta analyzers, SPECS systems, MBE chambers, cryostats,
  laser systems (Ti:Sapphire, FELs).
- Names: researchers may have Chinese, English, Japanese, Korean, or European
  names. Be careful with name order (family name first/last).
`.trim();

export const systemPrompt = [
  arpesDomainContext,
  "",
  `Be precise and evidence-based. Only extract information explicitly stated in the source text.`,
  `Mark confidence below 0.5 when information is ambiguous or inferred.`,
].join("\n");
