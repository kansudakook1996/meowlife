import type { IpcErrorCode, IpcResult } from '@shared/types'

export class ApiError extends Error {
  constructor(
    public readonly code: IpcErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Turn an IPC result into a value, or throw an ApiError with a Thai message. */
export async function unwrap<T>(pending: Promise<IpcResult<T>>): Promise<T> {
  const result = await pending
  if (result.ok) return result.data
  throw new ApiError(result.error.code, result.error.message)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ'
}

export const meow = (): Window['meow'] => window.meow
