/** Let any component ask the app shell to switch page (the menu lives in App.tsx). */
export const NAVIGATE_EVENT = 'meow:navigate'

export function navigateTo(page: string): void {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: page }))
}
