# Security rules

- BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Block in-app navigation and `window.open`; open only `https:` links externally via `shell.openExternal`.
- Keep the Content-Security-Policy in `src/renderer/index.html`. Widen `connect-src` only for
  specific Firebase hosts, never `*`.
- Validate every IPC payload with zod in the main process. Reject unknown fields (`.strict()`).
- Never embed: Firebase Admin SDK / service account JSON, GitHub tokens, PATs, any secret.
  Firebase *web* config (apiKey, projectId…) is public by design; protection comes from
  Security Rules + Auth, so rules must restrict data to `request.auth.uid`.
- `.env` is committed and may hold ONLY the public Firebase web config (`RENDERER_VITE_FIREBASE_*`).
  `.env.local` is git-ignored for local overrides. Anything secret never goes in either (ADR 0005).
- Run a secret scan (`git grep --cached -nE "ghp_|github_pat_|BEGIN .*PRIVATE KEY|private_key"`) and read
  `git status` before every commit — untracked files the owner drops in the folder get picked up by `git add -A`.
- Never log transaction titles, notes, amounts, emails, or tokens to files or telemetry.
- Restoring a backup must validate the file and make an automatic safety copy first.
- Firestore rules: no `allow read, write: if true;` outside the local emulator.
