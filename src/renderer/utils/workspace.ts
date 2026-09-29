export interface WorkspaceState {
  version: 1
  listWidth: number
  aiWidth: number
  wide: boolean
  selected: string | null
  page: number
  listScroll: number
  scroll: Record<string, number>
}
export const workspaceDefaults: WorkspaceState = { version: 1, listWidth: 280, aiWidth: 400, wide: false, selected: null, page: 1, listScroll: 0, scroll: {} }
export const workspaceKey = (dir: string): string => 'flownote:workspace:v1:' + dir
export function readWorkspace(dir: string): WorkspaceState {
  try {
    const v = JSON.parse(localStorage.getItem(workspaceKey(dir)) || '{}')
    if (v.version !== 1) return { ...workspaceDefaults, scroll: {} }
    return { ...workspaceDefaults, selected: typeof v.selected === 'string' ? v.selected : null,
      listWidth: Math.max(240, Math.min(400, Number(v.listWidth) || 280)),
      aiWidth: Math.max(360, Math.min(520, Number(v.aiWidth) || 400)), wide: v.wide === true,
      page: Math.max(1, Math.floor(Number(v.page)||1)),
      listScroll: Math.max(0, Number(v.listScroll) || 0),
      scroll: Object.fromEntries(Object.entries(v.scroll || {}).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) as Record<string, number> }
  } catch { return { ...workspaceDefaults, scroll: {} } }
}
export function writeWorkspace(dir: string, value: WorkspaceState): void {
  try { localStorage.setItem(workspaceKey(dir), JSON.stringify(value)) } catch { /* Layout preferences are optional. */ }
}
/** All local navigation paths ask mounted editors to flush drafts first. */
export function mayLeave(): boolean {
  return window.dispatchEvent(new Event('flownote:before-leave', { cancelable: true }))
}
