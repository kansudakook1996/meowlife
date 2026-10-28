import { errorMessage, meow, unwrap } from './api'
import { usePortal } from './portal'

/**
 * "Delete with undo": remove, then show a toast with "เลิกทำ" for 8 seconds.
 * Used by every Portal list (tasks, notes, goals, habits, journal).
 */
export function useDeleteWithUndo(
  remove: (id: string) => Promise<unknown>,
  restore: (id: string) => Promise<unknown>,
  reload: () => void
): (id: string, label: string) => Promise<void> {
  const { confirm, toast } = usePortal()
  return async (id, label) => {
    const ok = await confirm({
      title: 'ลบรายการนี้ไหม?',
      message: `"${label}" จะถูกลบออก (กด "เลิกทำ" ได้ภายใน 8 วินาที)`,
      confirmLabel: 'ลบ',
      danger: true
    })
    if (!ok) return
    try {
      await remove(id)
      reload()
      toast(`ลบ "${label}" แล้ว`, {
        action: {
          label: 'เลิกทำ',
          run: () => {
            restore(id).then(
              () => {
                reload()
                toast('กู้คืนแล้ว')
              },
              (error: unknown) => toast(errorMessage(error), { tone: 'error' })
            )
          }
        }
      })
    } catch (error) {
      toast(errorMessage(error), { tone: 'error' })
    }
  }
}

export { meow, unwrap }
