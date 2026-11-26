// Where the students' AI assistant keeps a conversation (ADR-28): in this browser tab only (sessionStorage), under the
// student's own key, and forgotten on sign-out, because it holds the student's data (Room, invoices, requests) and is
// sent back to the model with the next question.

const PREFIX = 'campusstay-assistant'

export const assistantKey = (userId) => `${PREFIX}:${userId}`

/** Forgets every conversation kept in this tab (on sign-out); also the one older builds kept under a single key. */
export function clearAssistantHistory() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k === PREFIX || k.startsWith(`${PREFIX}:`))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // storage refused: nothing was kept
  }
}

/** The longest turn the API takes (AssistantController: 2000 characters). */
export const MAX_TURN = 2000

/**
 * The turns sent with a question: the last `count`, without error bubbles, and without any turn over MAX_TURN, which
 * the API would refuse on every later question (WEB-STU-37). A signed answer cannot be cut (its signature would no
 * longer match), so a too-long one is left out whole. An answer the student stopped is kept on screen but never sent
 * (it has no signature), and neither is a question whose answer was stopped or failed: sent with the next question, it
 * was answered too, in the same reply.
 */
export function turnsToSend(messages, count = 20) {
  const unanswered = (i) => messages[i]?.role === 'user' && (messages[i + 1]?.stopped || messages[i + 1]?.error)
  return messages
    .filter((m, i) => !m.error && !m.stopped && !unanswered(i))
    .filter((m) => typeof m.content === 'string' && m.content.length <= MAX_TURN)
    .slice(-count)
    .map(({ role, content, signature }) => (signature ? { role, content, signature } : { role, content }))
}
