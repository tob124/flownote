import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'

let classifierInstance: { start: () => void; stop: () => void; poke: () => void } | null = null

export function setClassifierInstance(
  instance: { start: () => void; stop: () => void; poke: () => void } | null
): void {
  classifierInstance = instance
}

export function pokeClassifier(): void {
  classifierInstance?.poke()
}

export function registerClassifierIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CLASSIFIER_START, () => {
    classifierInstance?.start()
  })

  ipcMain.handle(IPC_CHANNELS.CLASSIFIER_STOP, () => {
    classifierInstance?.stop()
  })

  ipcMain.handle(IPC_CHANNELS.CLASSIFIER_POKE, () => {
    classifierInstance?.poke()
  })
}
