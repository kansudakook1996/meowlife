/** Firebase web config from .env / .env.local (public values, see docs/FIREBASE_SETUP_TH.md step 6). */
export const firebaseConfig = {
  apiKey: import.meta.env.RENDERER_VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.RENDERER_VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.RENDERER_VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.RENDERER_VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.RENDERER_VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.RENDERER_VITE_FIREBASE_APP_ID ?? ''
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every((v) => v.length > 0)
