export function safeParseJson(text: string): Record<string, unknown> | null {
  const mdMatch = text.match(/```(?:json)?\s*\n?(.*?)\n?```/s)
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim())
    } catch {
      // fall through to brace matching
    }
  }

  const braceMatch = text.match(/\{.*\}/s)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch {
      return null
    }
  }

  return null
}

export function retryOnFailure<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  maxRetries = 3,
  baseDelay = 2.0
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn(...args)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        if (attempt < maxRetries - 1) {
          const wait = baseDelay * Math.pow(2, attempt) * 1000
          console.warn(
            `Retry ${attempt + 1}/${maxRetries} failed, waiting ${wait / 1000}s: ${lastErr.message}`
          )
          await new Promise((r) => setTimeout(r, wait))
        }
      }
    }
    throw lastErr
  }
}
