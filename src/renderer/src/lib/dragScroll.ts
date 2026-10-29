/**
 * While dragging a row near the top or bottom edge of the scrolling area, scroll it so rows further away can be reached.
 * Call it from the pointermove handler with the element under the pointer.
 */
export function autoScrollNear(el: Element | null, clientY: number): void {
  let node: HTMLElement | null = el instanceof HTMLElement ? el : (el?.parentElement ?? null)
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      const rect = node.getBoundingClientRect()
      if (clientY < rect.top + 60) node.scrollTop -= 18
      else if (clientY > rect.bottom - 60) node.scrollTop += 18
      return
    }
    node = node.parentElement
  }
}