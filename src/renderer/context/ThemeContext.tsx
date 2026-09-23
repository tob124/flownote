import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

type ThemeName = 'paper' | 'dark' | 'solar' | 'draft'

const BASE_SANS = "'Source Sans Pro', 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif"

interface ThemeCtx {
  theme: ThemeName
  setTheme: (t: ThemeName) => void
  applyFont: (family: string, file: string) => Promise<boolean>
  clearFont: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'paper',
  setTheme: () => {},
  applyFont: async () => false,
  clearFont: () => {}
})

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setTheme] = useState<ThemeName>('paper')
  const fontFaceRef = useRef<FontFace | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Reset to system default on mount.
  useEffect(() => {
    document.documentElement.style.setProperty('--font-sans', BASE_SANS)
  }, [])

  const applyFont = useCallback(async (family: string, file: string): Promise<boolean> => {
    const url = await window.api.fonts.getPath(file)
    if (!url) return false
    try {
      if (fontFaceRef.current) {
        try {
          document.fonts.delete(fontFaceRef.current)
        } catch {
          // delete may be unavailable; ignore
        }
        fontFaceRef.current = null
      }
      const face = new FontFace(family, `url("${url}")`)
      await face.load()
      document.fonts.add(face)
      fontFaceRef.current = face
      document.documentElement.style.setProperty('--font-sans', `'${family}', ${BASE_SANS}`)
      return true
    } catch {
      return false
    }
  }, [])

  const clearFont = useCallback(() => {
    if (fontFaceRef.current) {
      try {
        document.fonts.delete(fontFaceRef.current)
      } catch {
        // ignore
      }
      fontFaceRef.current = null
    }
    document.documentElement.style.setProperty('--font-sans', BASE_SANS)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyFont, clearFont }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext)
}