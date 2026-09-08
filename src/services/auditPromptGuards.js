/**
 * auditPromptGuards — constraints appended to every audit system prompt.
 *
 * Why this exists: the audit system prompts give the model a Crux persona
 * ("senior strategist at CRUX Media, 15 years, 3B+ views managed") and, for
 * prospect audits, tell it to make the case for Crux. A model handed a
 * track record and a selling brief will invent specifics to support it.
 * One shipped audit reached a prospect carrying the sentence:
 *
 *   "CRUX has scaled essential oils and wellness channels from exactly
 *    this position."
 *
 * Nobody wrote that and nothing in the data implied it. The persona is
 * fine — it shapes voice — but the model does not get to extend it with
 * results, client names, or category experience it cannot have.
 *
 * Claims about what Crux has done before are supplied by a human, from
 * material a human can stand behind.
 */

export const NO_FIRST_PARTY_CLAIMS = `
HARD CONSTRAINT — claims about Crux.
You may describe what Crux WOULD do for this channel: the approach, the
sequence, the reasoning. You may NOT state anything about what Crux HAS
done. Never assert past results, named or unnamed clients, category or
vertical experience, timeframes, or outcome numbers attributed to Crux —
not as fact, not as illustration, not hedged with "typically" or "we
often see". If a sentence would need a case study to be true, do not
write it. Those come from a human, later, and their absence is correct.
Say nothing rather than something you cannot source.`;

/**
 * Append the guard to a system prompt.
 * @param {string} systemPrompt
 * @returns {string}
 */
export function withPromptGuards(systemPrompt) {
  return `${systemPrompt}\n${NO_FIRST_PARTY_CLAIMS}`;
}

export default { NO_FIRST_PARTY_CLAIMS, withPromptGuards };
