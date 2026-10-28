import type { MeowBridge } from '../shared/ipc'

declare global {
  interface Window {
    meow: MeowBridge
  }
}

export {}
