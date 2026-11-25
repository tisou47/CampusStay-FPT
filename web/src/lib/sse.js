/**
 * Splits Server-Sent Events text into complete events and the unfinished tail (D6, the assistant's stream).
 * An event is lines up to a blank line; `event:` names it (default "message"), `data:` lines are joined by "\n".
 * @returns {{ events: { event: string, data: string }[], rest: string }}
 */
export function parseSse(buffer) {
  const events = []
  const blocks = buffer.replace(/\r\n?/g, '\n').split('\n\n')
  const rest = blocks.pop()
  for (const block of blocks) {
    let event = 'message'
    const data = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (data.length || event !== 'message') events.push({ event, data: data.join('\n') })
  }
  return { events, rest }
}
