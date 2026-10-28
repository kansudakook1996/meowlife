# Architecture rules

- Layering: `renderer → window.meow (preload) → ipcMain handler → repository → SQLite`.
  Renderer never touches Node, files, or the database directly.
- Business rules (money math, status, recurring dates, summaries) live in `src/shared/` as pure
  functions, so they can be unit-tested without Electron.
- Repositories in `src/main/db/` take a `DatabaseSync` instance as a parameter. Tests pass `:memory:`.
- Schema changes go through a new numbered migration in `src/main/db/migrations.ts`.
  Never edit a migration that has shipped in a release; add a new one.
- Every syncable table has: `id TEXT` (UUID), `created_at`, `updated_at`, `deleted_at`, `dirty`.
- IPC channel names are declared once in `src/shared/ipc.ts`; preload exposes only those.
- The database file lives in `app.getPath('userData')`, never inside the install folder.
- Renderer-only packages are devDependencies (bundled by Vite). Packages the main process
  imports at runtime must be in `dependencies` (they are packed into the app).
