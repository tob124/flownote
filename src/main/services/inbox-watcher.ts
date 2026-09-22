import { processInbox } from '../store/inbox-store'

const POLL_INTERVAL_MS = 10_000

class InboxWatcher {
  private timer: NodeJS.Timeout | null = null
  private warned = false

  init(): void {
    this.stop() // 防御重复 init
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS)
    this.tick() // 启动后立刻读取一次
  }

  private tick(): void {
    try {
      processInbox()
      this.warned = false
    } catch (e) {
      if (!this.warned) {
        console.error('[InboxWatcher] processInbox failed (will retry every 10s):', e)
        this.warned = true
      }
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

export const inboxWatcher = new InboxWatcher()
