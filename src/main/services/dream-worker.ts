import type { BrowserWindow } from 'electron'
import { requestDream } from './thinking-service'
// Automatic triggers are owned by the persistent thinking queue.
export async function maybeAutoDream(_win: BrowserWindow): Promise<void> {}
export async function startDream(_dir: string, _provider: string, _key: string, _win: BrowserWindow): Promise<void> {
  requestDream()
}
