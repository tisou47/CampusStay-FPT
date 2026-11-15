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
