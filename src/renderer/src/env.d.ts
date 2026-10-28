/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly RENDERER_VITE_FIREBASE_API_KEY?: string
  readonly RENDERER_VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly RENDERER_VITE_FIREBASE_PROJECT_ID?: string
  readonly RENDERER_VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly RENDERER_VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly RENDERER_VITE_FIREBASE_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
