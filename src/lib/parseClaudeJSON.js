/**
 * Parse JSON from Claude API response text.
 *
 * Claude sometimes wraps JSON output in markdown code fences (```json ... ```).
 * This utility strips those wrappers before parsing.
 *
 * @param {string} rawText - The raw text from claudeAPI.call().text
 * @param {Object|null} fallback - Optional fallback if parsing fails (null = rethrow error)
 * @returns {Object} Parsed JSON object
 * @throws {SyntaxError} If parsing fails and no fallback is provided
 */
export function parseClaudeJSON(rawText, fallback = null) {
  let text = (rawText || '').trim();

  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    if (fallback !== null) {
      console.warn('[parseClaudeJSON] Failed to parse, using fallback:', err.message);
      return fallback;
    }
    throw err;
  }
}
