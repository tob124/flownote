// All model and search requests share the same two slots.
let active = 0
const waiting: Array<() => void> = []
export async function limited<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  else active++
  try {
    signal?.throwIfAborted()
    return await run()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}
