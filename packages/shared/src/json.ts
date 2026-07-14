// ---------------------------------------------------------------------------
// JSON extraction helpers — used by the pipeline to parse LLM responses
// that may include markdown fences or stray text around JSON arrays.
// ---------------------------------------------------------------------------

/**
 * Extract a JSON array from a raw LLM response string.
 *
 * Handles:
 *  - ```json ... ``` fences
 *  - Leading/trailing non-JSON text
 *  - Empty or invalid responses
 *
 * Returns the parsed array, or `null` if extraction fails.
 */
export function extractJsonArray(raw: string): unknown[] | null {
  if (!raw) return null;

  // Strip markdown code fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');

  if (arrStart === -1 || arrEnd === -1 || arrStart >= arrEnd) return null;

  try {
    const parsed = JSON.parse(cleaned.substring(arrStart, arrEnd + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
