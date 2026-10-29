import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Native <dialog>: gives focus trapping, Esc to close and a backdrop for free. */
export function Modal({ open, title, onClose, children }: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React's autoFocus runs before the dialog is shown and is lost; focus the first field ourselves
      // so you can start typing right away (otherwise focus lands on the ✕ button).
      const field = dialog.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]), textarea, select')
      const fallback = dialog.querySelector<HTMLElement>('.form-actions button, .modal-body > p ~ div button')
      ;(field ?? fallback)?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-header">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="ปิด" title="ปิด (Esc)" onClick={onClose}>
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
