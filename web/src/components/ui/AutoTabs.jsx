/* Lucian UX/UI Prompt #213 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#213 */
import { useEffect, useId, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import './lucian-213.css'

const DUR = 4200

/**
 * Tabs that move on by themselves: the bar under the current tab fills with the time left, then the next one opens.
 * Press a tab to jump to it; resting the pointer on the content or focusing inside pauses the bar. With reduced motion
 * the tabs stay put. Every panel stays mounted, so what it loaded and its scroll position survive a change.
 * tabs: [{ key, label, icon, note, action, content }]
 */
export function AutoTabs({ tabs, initial = 0, eyebrow, title, label, className }) {
  const count = tabs.length
  const [active, setActive] = useState(() => Math.min(Math.max(initial, 0), count - 1))
  const uid = useId()
  const root = useRef(null)
  const timer = useRef({ acc: 0, hold: false })
  const current = useRef(active)
  const list = useRef([])
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // A new tab starts its bar over and plays its scene.
  useEffect(() => {
    current.current = active
    timer.current.acc = 0
    const el = root.current
    el.querySelectorAll(':scope > .u213-tl > .u213-tb').forEach((tab, i) => {
      tab.querySelector('b').style.transform = `scaleX(${i === active && reduced ? 1 : 0})`
    })
    el.querySelectorAll(':scope > .u213-pv > .u213-pn').forEach((panel, i) => {
      panel.classList.remove('is-play')
      if (i === active) {
        void panel.offsetWidth
        panel.classList.add('is-play')
      }
    })
  }, [active, reduced])

  useEffect(() => {
    if (reduced || count < 2) return undefined
    const el = root.current
    let raf = 0
    let last = 0
    let visible = true
    const tick = (now) => {
      raf = 0
      const clock = timer.current
      if (!clock.hold && visible) clock.acc += Math.min(64, now - last)
      last = now
      const progress = Math.min(1, clock.acc / DUR)
      el.querySelectorAll(':scope > .u213-tl > .u213-tb')[current.current]?.querySelector('b')?.style.setProperty('transform', `scaleX(${progress.toFixed(3)})`)
      if (progress >= 1) {
        clock.acc = 0
        setActive((c) => (c + 1) % count)
      }
      if (visible) raf = requestAnimationFrame(tick)
    }
    const run = () => {
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting
      if (visible) run()
    })
    observer.observe(el)
    run()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [count, reduced])

  const onKeyDown = (event, i) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (i + step + count) % count
    setActive(next)
    list.current[next]?.focus()
  }

  return (
    <div
      ref={root}
      className={cx('ux u213', className)}
      style={{ '--u213-n': count }}
      onFocus={() => {
        timer.current.hold = true
      }}
      onBlur={() => {
        timer.current.hold = false
      }}
    >
      {(eyebrow || title) && (
        <div className="u213-hd">
          {eyebrow && <small>{eyebrow}</small>}
          {title && <h3>{title}</h3>}
        </div>
      )}
      <div className="u213-tl" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              ref={(node) => {
                list.current[i] = node
              }}
              type="button"
              id={`${uid}t${i}`}
              role="tab"
              aria-selected={i === active}
              aria-controls={`${uid}p${i}`}
              tabIndex={i === active ? 0 : -1}
              className={cx('u213-tb', i === active && 'is-on')}
              onClick={() => setActive(i)}
              onKeyDown={(event) => onKeyDown(event, i)}
            >
              {Icon && <Icon aria-hidden="true" />}
              {tab.label}
              <i>
                <b />
              </i>
            </button>
          )
        })}
      </div>
      <div
        className="u213-pv"
        onPointerEnter={() => {
          timer.current.hold = true
        }}
        onPointerLeave={() => {
          timer.current.hold = false
        }}
      >
        {tabs.map((tab, i) => (
          <div key={tab.key} id={`${uid}p${i}`} role="tabpanel" aria-labelledby={`${uid}t${i}`} className={cx('u213-pn', i === active && 'is-on')}>
            {(tab.note || tab.action) && (
              <div className="u213-nt">
                <span>{tab.note}</span>
                {tab.action}
              </div>
            )}
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  )
}
