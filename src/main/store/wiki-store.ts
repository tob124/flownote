import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync, renameSync } from 'fs'
import { join } from 'path'
import { getSyncDir } from './note-store'
import { getLogger } from '../utils/logger'

const log = getLogger('wiki-store')

export function listWikis(): string[] {
  const syncDir = getSyncDir()
  if (!syncDir) return []
  const wikisDir = join(syncDir, 'wikis')
  if (!existsSync(wikisDir)) return []
  try {
    return readdirSync(wikisDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export function loadWiki(filename: string): string {
  const syncDir = getSyncDir()
  if (!syncDir) return ''
  try {
    return readFileSync(join(syncDir, 'wikis', filename), 'utf-8')
  } catch {
    return ''
  }
}

export function saveWiki(category: string, month: string, content: string): void {
  const syncDir = getSyncDir()
  if (!syncDir) return
  const filePath = join(syncDir, 'wikis', `${category}_${month}.md`)
  try {
    // 记录旧版本到 sidecar，供 diff 高亮"最近改动"使用
    if (existsSync(filePath)) {
      const old = readFileSync(filePath, 'utf-8')
      writeDiffSidecar(syncDir, `${category}_${month}.md`, old)
      // 备份旧版本（读取的是覆盖前的文件内容）
      backupWiki(category, month)
    }
    writeFileSync(filePath, content, 'utf-8')
    log.info(`Wiki saved: ${category}_${month}.md`)
  } catch (e) {
    log.error(`Failed to save wiki: ${e}`)
  }
}

/**
 * 写入最近一次编辑前的旧内容快照，命名为 <file>.prev，存于 wikis/.prev/ 下。
 */
function writeDiffSidecar(syncDir: string, filename: string, oldContent: string): void {
  try {
    const prevDir = join(syncDir, 'wikis', '.prev')
    if (!existsSync(prevDir)) mkdirSync(prevDir, { recursive: true })
    writeFileSync(join(prevDir, `${filename}.prev`), oldContent, 'utf-8')
  } catch (e) {
    log.error(`Failed to write diff sidecar: ${e}`)
  }
}

/** 读取 <file>.prev 快照（不存在则返回空串）。 */
export function loadDiffSidecar(syncDir: string, filename: string): string {
  try {
    const prevPath = join(syncDir, 'wikis', '.prev', `${filename}.prev`)
    return existsSync(prevPath) ? readFileSync(prevPath, 'utf-8') : ''
  } catch {
    return ''
  }
}

export function wikiExists(category: string, month: string): boolean {
  const syncDir = getSyncDir()
  if (!syncDir) return false
  return existsSync(join(syncDir, 'wikis', `${category}_${month}.md`))
}

/**
 * 备份旧版本 wiki 到 backups 目录，保留最近 5 个版本
 */
export function backupWiki(category: string, month: string): void {
  const syncDir = getSyncDir()
  if (!syncDir) return
  
  const sourcePath = join(syncDir, 'wikis', `${category}_${month}.md`)
  if (!existsSync(sourcePath)) return
  
  const backupsDir = join(syncDir, 'wikis', 'backups')
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true })
  }
  
  // 创建带时间戳的备份文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupFilename = `${category}_${month}_${timestamp}.md`
  const backupPath = join(backupsDir, backupFilename)
  
  try {
    const content = readFileSync(sourcePath, 'utf-8')
    writeFileSync(backupPath, content, 'utf-8')
    log.info(`Wiki backed up: ${backupFilename}`)
    
    // 清理旧备份，保留最近 5 个版本
    cleanupBackups(category, month, 5)
  } catch (e) {
    log.error(`Failed to backup wiki: ${e}`)
  }
}

/**
 * 清理备份，保留最近 N 个版本
 */
export function cleanupBackups(category: string, month: string, keepCount: number): void {
  const syncDir = getSyncDir()
  if (!syncDir) return
  
  const backupsDir = join(syncDir, 'wikis', 'backups')
  if (!existsSync(backupsDir)) return
  
  try {
    const prefix = `${category}_${month}_`
    const backups = readdirSync(backupsDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
      .sort()
      .reverse()
    
    // 删除超出保留数量的旧备份
    const toDelete = backups.slice(keepCount)
    for (const file of toDelete) {
      unlinkSync(join(backupsDir, file))
      log.info(`Old backup deleted: ${file}`)
    }
  } catch (e) {
    log.error(`Failed to cleanup backups: ${e}`)
  }
}

function sealedDir(): string | null {
  const syncDir = getSyncDir()
  if (!syncDir) return null
  const dir = join(syncDir, 'wikis', 'sealed')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 封存当前活跃的 wiki：把 ${category}_${month}.md 移到 sealed/ 子目录（带时间戳，避免重名），
 * 并在原位新建一个空文件，让后续分类器生成的笔记“另起炉灶”。
 * 目的：长 wiki 重新整编会显著抬高 AI 成本，且不便阅读；封存后可控制成本、保持可读。
 * 返回封存后的文件名与新活文件的基础名。
 */
export function sealWiki(category: string, month: string): { sealed: string; fresh: string } | null {
  const syncDir = getSyncDir()
  const dir = sealedDir()
  if (!syncDir || !dir) return null

  const filename = `${category}_${month}.md`
  const sourcePath = join(syncDir, 'wikis', filename)

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const sealedName = `${category}_${month}_sealed_${ts}.md`

  try {
    if (existsSync(sourcePath) && readFileSync(sourcePath, 'utf-8').trim()) {
      renameSync(sourcePath, join(dir, sealedName))
      log.info(`Wiki sealed: ${filename} -> sealed/${sealedName}`)
    } else {
      log.info(`Wiki seal: ${filename} is empty, only reset`)
    }
    // 另起炉灶：写一个空的新 wiki，后续笔记从这里重新累积
    writeFileSync(sourcePath, '', 'utf-8')
    return { sealed: sealedName, fresh: filename }
  } catch (e) {
    log.error(`Failed to seal wiki ${filename}: ${e}`)
    return null
  }
}

export function listSealedWikis(): string[] {
  const dir = sealedDir()
  if (!dir) return []
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export function loadSealedWiki(filename: string): string {
  const dir = sealedDir()
  if (!dir) return ''
  try {
    return readFileSync(join(dir, filename), 'utf-8')
  } catch {
    return ''
  }
}
