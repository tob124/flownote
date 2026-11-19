export const AI_MODELS = { deepseek: 'deepseek-flash' } as const
// Writing targets are advisory; only the provider's documented maximum is sent.
export const AI_LIMITS = { inputChars: 64000, chunkChars: 12000, outputTokens: 393216, outputWarningTokens: 16000, searchCalls: 6, pages: 12, fetchAttempts: 24 } as const
