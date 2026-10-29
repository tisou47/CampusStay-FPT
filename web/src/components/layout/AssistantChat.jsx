import { useEffect, useRef, useState } from 'react'
import { Bot, RotateCcw, SendHorizontal, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { IconButton } from '@/components/ui/Button'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'

/*
 * The students' AI assistant (ADR-28): a chat button on every student page, shown only when the server has a model
 * (GET /students/me/assistant). The conversation stays in this browser tab (sessionStorage); each question sends the
 * recent turns and the server answers from the user guide and the student's own data.
 */

const STORAGE_KEY = 'campusstay-assistant'
const SENT_TURNS = 20

function load() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function save(messages) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // Private windows may refuse storage: the conversation then lasts until the page reloads.
  }
}

/** The model writes light Markdown: keep the line breaks and bold text, show the rest as typed. */
function Formatted({ text }) {
  return text.split('\n').map((line, i) => (
    <p key={i} className={cx('min-h-[1lh]', /^\s*([-*•]|\d+\.)\s/.test(line) && 'pl-3 -indent-3')}>
      {line
        .replace(/^\s*[-*]\s/, '• ')
        .split(/\*\*(.+?)\*\*/g)
        .map((part, j) => (j % 2 ? <strong key={j}>{part}</strong> : part))}
    </p>
  ))
}

function Bubble({ message }) {
  const mine = message.role === 'user'
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm break-words',
          mine ? 'bg-primary text-fg-on-brand' : message.error ? 'bg-warning-bg text-warning-fg' : 'bg-subtle text-fg',
        )}
      >
        {mine ? <p className="whitespace-pre-wrap">{message.content}</p> : <Formatted text={message.content} />}
      </div>
    </div>
  )
}

const SUGGESTIONS = ['When is the registration deadline?', 'Which Invoices do I still have to pay?', 'How do I report a broken item in my Room?']

export function AssistantChat() {
  const status = useQuery(['assistant'], ({ signal }) => api.me.assistant(null, { signal }))
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(load)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const end = useRef(null)
  const input = useRef(null)

  useEffect(() => save(messages), [messages])
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' })
  }, [open, messages, pending])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!status.data?.enabled) return null

  async function ask(text) {
    const question = text.trim()
    if (!question || pending) return
    const turns = [...messages.filter((m) => !m.error), { role: 'user', content: question }]
    setMessages((m) => [...m, { role: 'user', content: question }])
    setDraft('')
    setPending(true)
    try {
      const { reply } = await api.me.askAssistant({
        messages: turns.slice(-SENT_TURNS).map(({ role, content }) => ({ role, content })),
      })
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (error) {
      setMessages((m) => [...m, { role: 'assistant', content: error.message, error: true }])
    } finally {
      setPending(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      ask(draft)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Ask the CampusStay Assistant')}
        className="fixed right-4 bottom-24 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-fg-on-brand shadow-lg transition-transform hover:scale-105 lg:right-6 lg:bottom-6"
      >
        <Bot size={26} aria-hidden="true" />
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label={t('CampusStay Assistant')}
      className="fixed inset-0 z-50 flex flex-col bg-surface lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[min(640px,calc(100dvh-6rem))] lg:w-100 lg:rounded-xl lg:border lg:border-line lg:shadow-xl"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-subtle text-fg-brand">
          <Bot size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-fg">{t('CampusStay Assistant')}</h2>
          <p className="text-xs text-fg-secondary">{t('Answers from the user guide and your own records. It can make mistakes.')}</p>
        </div>
        {messages.length > 0 && (
          <IconButton icon={RotateCcw} aria-label={t('New conversation')} onClick={() => setMessages([])} disabled={pending} />
        )}
        <IconButton icon={X} aria-label={t('Close')} onClick={() => setOpen(false)} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-fg-secondary">{t('Hello! Ask me how to use CampusStay or about your Application, Room, Invoices and requests.')}</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(t(s))}
                className="rounded-lg border border-line px-3 py-2 text-left text-sm text-fg hover:bg-subtle"
              >
                {t(s)}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {pending && <p className="text-sm text-fg-secondary">{t('The assistant is writing…')}</p>}
        <div ref={end} />
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t border-line px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          ask(draft)
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Type your question')}
          aria-label={t('Type your question')}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
        />
        <IconButton
          icon={SendHorizontal}
          type="submit"
          size="lg"
          aria-label={t('Send')}
          disabled={pending || !draft.trim()}
          className="bg-primary text-fg-on-brand hover:bg-primary-hover disabled:opacity-45"
        />
      </form>
    </section>
  )
}
