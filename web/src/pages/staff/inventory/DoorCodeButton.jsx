import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, PenLine, RotateCw, Shuffle, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

/*
 * Rooms and beds › the room's "Door code" button: one place to see and change the code. It opens a popover (a bottom
 * sheet below 720 px) with the code hidden in six boxes, Show / Hide and Copy (each view goes to the Audit Log through
 * POST /door-codes/{room}/reveal), and the change: draw or type a new code (POST /door-codes/{room}), then confirm it
 * once it is on the lock (POST …/confirm) or drop it (POST …/cancel). A code once shown stays shown for the room until
 * the page is reloaded or the code changes (kept in memory, never in storage), so reopening the popover neither asks
 * the server again nor the out-of-shift question; Hide code only hides it on screen.
 */

// Codes shown in this page load, by room: { active, proposed }. Dropped when the room's code changes.
const shownCodes = new Map()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Digits({ code, label }) {
  const chars = (code ?? '').padEnd(6, ' ').slice(0, 6).split('')
  return (
    <span role="img" aria-label={label} className="flex gap-1.5">
      {chars.map((c, i) => (
        <span key={i} aria-hidden="true" className="flex h-10 w-8 items-center justify-center rounded-md border border-line bg-subtle font-mono text-h2 font-semibold text-fg tabular">
          {code ? c : '•'}
        </span>
      ))}
    </span>
  )
}

export function DoorCodeButton({ room, door, loading }) {
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  // The code is kept for this room and this version of it (another person may change it meanwhile).
  const cacheKey = `${room}|${door?.activeSince ?? ''}|${door?.proposed ? 'p' : ''}`
  const [codes, setCodes] = useState(() => shownCodes.get(cacheKey) ?? null) // { active, proposed } once shown
  const [step, setStep] = useState('view') // view | type | confirm
  const [typed, setTyped] = useState('')
  const [newCode, setNewCode] = useState(null)
  const [retry, setRetry] = useState(null)
  const wrap = useRef(null)
  const panel = useRef(null)
  const button = useRef(null)
  const titleId = useId()

  const close = () => {
    setOpen(false)
    setCodes(shownCodes.get(cacheKey) ?? null)
    setStep('view')
    setTyped('')
    setNewCode(null)
    setRetry(null)
    button.current?.focus()
  }

  const reveal = useMutation(() => api.doorCodes.reveal(room), {
    onSuccess: (shown) => {
      shownCodes.set(cacheKey, shown)
      setCodes(shown)
    },
    onError: () => setRetry(() => () => reveal.run()),
  })
  const propose = useMutation((body) => api.doorCodes.propose(room, body), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: (res) => {
      setNewCode(res.code)
      setStep('confirm')
    },
    onError: () => {},
  })
  const confirm = useMutation(() => api.doorCodes.confirm(room), {
    invalidates: ['door-codes', 'inventory', 'dashboard'],
    onSuccess: () => {
      notify({ title: t('Door code of Room {code} changed', { code: room }), message: 'Its residents are told that the code changed (never the code itself).' })
      shownCodes.delete(cacheKey)
      setCodes(null)
      setNewCode(null)
      setStep('view')
    },
    onError: () => {},
  })
  const cancel = useMutation(() => api.doorCodes.cancel(room), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: () => {
      shownCodes.delete(cacheKey)
      setNewCode(null)
      setCodes(null)
      setStep('view')
    },
    onError: () => {},
  })
  // The room's code changed (here or by someone else): show what is known of the new version, if anything.
  useEffect(() => {
    setCodes(shownCodes.get(cacheKey) ?? null)
  }, [cacheKey])
  // Shows the code: the one already shown in this page load, else asks the server (written to the audit log).
  const show = () => {
    const known = shownCodes.get(cacheKey)
    if (known) return setCodes(known)
    setRetry(() => () => reveal.run())
    reveal.run()
  }
  const error =reveal.error ?? propose.error ?? confirm.error ?? cancel.error
  const busy = reveal.pending || propose.pending || confirm.pending || cancel.pending

  // Escape closes, Tab stays inside, a click outside closes; focus goes back to the button.
  useEffect(() => {
    if (!open) return undefined
    panel.current?.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Escape in another dialog (the out-of-shift question) closes that dialog only.
        if (e.target instanceof Element && !panel.current?.contains(e.target) && e.target.closest('[aria-modal="true"]')) return
        e.stopPropagation()
        close()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const [first, last] = [items[0], items.at(-1)]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    // A click in another dialog (the out-of-shift question asked by a view of the code) is not a click outside.
    const onDown = (e) => {
      if (!wrap.current || wrap.current.contains(e.target)) return
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const copy = async () => {
    const shown = codes ?? shownCodes.get(cacheKey) ?? (await reveal.run().catch(() => null))
    const value = shown?.active ?? shown?.proposed
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      notify({ title: t('Code copied') })
    } catch {
      /* clipboard blocked: the code is on screen to copy by hand */
    }
  }

  const active = door?.status === 'Active'
  const shownCode = step === 'confirm' ? newCode : codes ? (codes.active ?? codes.proposed) : null

  return (
    <div ref={wrap} className="relative">
      <Button
        ref={button}
        size="lg"
        block
        icon={KeyRound}
        className="justify-center px-3"
        disabled={loading || !door}
        title={!loading && !door ? t('This room has no door code.') : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="flex items-center gap-2">
          {t('Door code')}
          <span aria-hidden="true" className={cx('size-2 rounded-full', active ? 'bg-success' : 'bg-fg-tertiary')} />
          <span className="sr-only">{door ? t(door.status) : t('Not set')}</span>
        </span>
      </Button>

      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-gray-900/45 min-[720px]:hidden" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="z-50 flex flex-col gap-4 bg-surface p-4 shadow-modal outline-none max-[719px]:fixed max-[719px]:inset-x-0 max-[719px]:bottom-0 max-[719px]:rounded-t-xl min-[720px]:absolute min-[720px]:top-full min-[720px]:right-0 min-[720px]:mt-2 min-[720px]:w-[360px] min-[720px]:rounded-xl min-[720px]:border min-[720px]:border-line"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={titleId} className="text-h3 font-semibold text-fg">
                  {t('Door code · {room}', { room })}
                </h3>
                <StatusTag status={door.status} />
                {door.proposed && step !== 'confirm' && (
                  <Tag tone="info" dot={false}>
                    New code waiting
                  </Tag>
                )}
              </div>
              <button type="button" onClick={close} aria-label={t('Close')} className="rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {error && (
              <Alert type="error" title="Could not change the door code">
                <span className="flex flex-col items-start gap-2">
                  {error.summary ?? error.message}
                  {retry && (
                    <Button size="sm" icon={RotateCw} iconSize={14} onClick={() => retry()}>
                      Retry
                    </Button>
                  )}
                </span>
              </Alert>
            )}

            {step === 'type' ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setRetry(() => () => propose.run({ code: typed }))
                  propose.run({ code: typed })
                }}
              >
                <label className="flex flex-col gap-1 text-sm text-fg-secondary">
                  {t('New code (6 digits)')}
                  <Input
                    autoFocus
                    value={typed}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="off"
                    onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setStep('view')}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={busy || typed.length !== 6}>
                    Use this code
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {step === 'confirm' && <span className="text-sm font-medium text-fg">{t('New code')}</span>}
                  <Digits code={shownCode} label={shownCode ? t('Code {code}', { code: shownCode.split('').join(' ') }) : t('Code hidden')} />
                  {step === 'view' && codes?.proposed && codes.active && <span className="text-sm text-fg-tertiary">{t('New code: {code}', { code: codes.proposed })}</span>}
                </div>
                {step === 'view' && (
                  <div className="flex flex-wrap gap-2">
                    {codes ? (
                      <Button
                        icon={EyeOff}
                        onClick={() => {
                          shownCodes.delete(cacheKey)
                          setCodes(null)
                        }}
                      >
                        Hide code
                      </Button>
                    ) : (
                      <Button
                        icon={Eye}
                        tip="Every view is written to the audit log."
                        disabled={busy}
                        onClick={show}
                      >
                        Show code
                      </Button>
                    )}
                    <Button icon={Copy} disabled={busy} onClick={copy}>
                      Copy
                    </Button>
                  </div>
                )}
                {door.activeSince && step === 'view' && <p className="text-sm text-fg-tertiary">{t('Last changed: {date}', { date: formatDateTime(door.activeSince) })}</p>}

                {step === 'confirm' ? (
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    <p className="text-sm text-fg-secondary">{t('Set this code on the lock first. The old code stops working as soon as you confirm.')}</p>
                    <p className="text-sm text-fg-tertiary">{t('The {n} residents of the room are told that the code changed (never the code itself).', { n: door.residents ?? 0 })}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button disabled={busy} onClick={() => cancel.run()}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        icon={Check}
                        disabled={busy}
                        onClick={() => {
                          setRetry(() => () => confirm.run())
                          confirm.run()
                        }}
                      >
                        Confirm the change
                      </Button>
                    </div>
                  </div>
                ) : door.proposed ? (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button variant="primary" icon={Check} disabled={busy} onClick={() => confirm.run()}>
                      The lock uses this code
                    </Button>
                    <Button disabled={busy} onClick={() => cancel.run()}>
                      Drop the new code
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                    <Button
                      variant="primary"
                      icon={Shuffle}
                      disabled={busy}
                      onClick={() => {
                        setRetry(() => () => propose.run({}))
                        propose.run({})
                      }}
                    >
                      New code
                    </Button>
                    <Button icon={PenLine} disabled={busy} onClick={() => setStep('type')}>
                      Type a code
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
