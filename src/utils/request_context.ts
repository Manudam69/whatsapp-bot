import { AsyncLocalStorage } from 'async_hooks'

interface RequestContext {
  requestId: string
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>()

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId
}
