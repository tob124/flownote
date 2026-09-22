import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'

const FONT_DIR = join(homedir(), '.flownote', 'fonts')

const ALLOWED_EXTS = ['.ttf', '.otf', '.woff', '.woff2', '.WOFF', '.OTF', '.TTF', '.WOFF2']

interface FontInfo {
  file: string
  family: string
}

function ensureDir(): void {
  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true })
}

function familyFromFilename(filename: string): string {
  return basename(filename).replace(/\.[^.]+$/, '')
}

export function importFont(srcPath: string): FontInfo {
  if (!existsSync(srcPath)) throw new Error('字体文件不存在')
  const ext = extname(srcPath)
  if (!ALLOWED_EXTS.includes(ext)) {
    throw new Error(`不支持该字体格式：${ext || '未知'}`)
  }
  ensureDir()
  // 生成唯一文件名，避免同名冲突
  const file = `${Date.now()}_${basename(srcPath)}`
  copyFileSync(srcPath, join(FONT_DIR, file))
  return { file, family: familyFromFilename(file) }
}

export function listFonts(): FontInfo[] {
  if (!existsSync(FONT_DIR)) return []
  try {
    return readdirSync(FONT_DIR)
      .filter((f) => ALLOWED_EXTS.includes(extname(f)))
      .map((f) => ({ file: f, family: familyFromFilename(f) }))
      .sort((a, b) => a.file.localeCompare(b.file))
  } catch {
    return []
  }
}

export function deleteFont(file: string): void {
  const target = join(FONT_DIR, file)
  // 防目录穿越
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return
  if (existsSync(target) && statSync(target).isFile()) {
    unlinkSync(target)
  }
}

export function getFontPath(file: string): string | null {
  const target = join(FONT_DIR, file)
  return existsSync(target) && statSync(target).isFile() ? target : null
}