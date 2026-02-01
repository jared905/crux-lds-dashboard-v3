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

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (_firstErr) {
    // Fall through to extraction attempts
  }

  // Try extracting JSON from a code fence anywhere in the text
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) { /* fall through */ }
  }

  // Try extracting the first { ... } or [ ... ] block
  const braceStart = text.indexOf('{');
  const bracketStart = text.indexOf('[');
  const start = braceStart === -1 ? bracketStart
    : bracketStart === -1 ? braceStart
    : Math.min(braceStart, bracketStart);

  if (start !== -1) {
    const isArray = text[start] === '[';
    const closer = isArray ? ']' : '}';
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === text[start]) depth++;
      else if (text[i] === closer) depth--;
      if (depth === 0) { end = i; break; }
    }
    if (end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_) { /* fall through */ }
    }
  }

  if (fallback !== null) {
    console.warn('[parseClaudeJSON] All parse attempts failed. Raw text (first 500 chars):', text.slice(0, 500));
    return fallback;
  }
  throw new SyntaxError(`Failed to parse JSON from Claude response: ${text.slice(0, 200)}`);
}
