# Security rules

- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Block in-app navigation and `window.open`; open only `https:` links externally via `shell.openExternal`.
- Keep the Content-Security-Policy in `src/renderer/index.html`. Widen `connect-src` only for
  specific Firebase hosts, never `*`.
- Validate every IPC payload with zod in the main process. Reject unknown fields (`.strict()`).
- Never embed: Firebase Admin SDK / service account JSON, GitHub tokens, PATs, any secret.
  Firebase *web* config (apiKey, projectId…) is public by design; protection comes from
  Security Rules + Auth, so rules must restrict data to `request.auth.uid`.
- `.env.local` is git-ignored. Only `.env.example` (no real values) is committed.
- Never log transaction titles, notes, amounts, emails, or tokens to files or telemetry.
- Restoring a backup must validate the file and make an automatic safety copy first.
- Firestore rules: no `allow read, write: if true;` outside the local emulator.
