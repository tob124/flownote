export const AI_MODELS = { deepseek: 'deepseek-flash', gemini: 'gemini-2.0-flash' } as const
export const AI_LIMITS = { inputChars: 64000, chunkChars: 12000, outputTokens: 12000, searchCalls: 6, serverSearches: 2, pages: 12, fetchAttempts: 24 } as const
