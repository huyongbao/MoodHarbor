import { useEffect, useRef } from "react"
import { Icon } from "./Artwork"

export default function Modal({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  locked?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ locked, onClose })
  latest.current = { locked, onClose }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    const body = ref.current
    body?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !latest.current.locked) latest.current.onClose()
      if (e.key === "Tab") {
        const items = body?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        )
        if (!items?.length) {
          e.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === body)
        ) {
          e.preventDefault()
          last.focus()
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === body)
        ) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => {
      document.removeEventListener("keydown", handler)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          {!locked && (
            <button className="icon-button" aria-label="关闭" onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
