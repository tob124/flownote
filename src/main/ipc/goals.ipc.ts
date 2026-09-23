import { ipcMain } from 'electron'
import { loadConfig } from '../store/config-store'
import {
  GoalStoreError, addCheckIn, addCommitment, addDecision, createGoal,
  linkNote, linkGoalCollection, listGoals, updateCommitment, updateGoal
} from '../store/goal-store'
import { IPC_CHANNELS } from '../../shared/types'
import type {
  CheckInInput, CommitmentInput, CommitmentStatus, DecisionInput,
  GoalInput, GoalPatch, GoalResult
} from '../../shared/goals'

function run<T>(action: (syncDir: string) => T): GoalResult<T> {
  try {
    return { ok: true, value: action(loadConfig().sync_dir) }
  } catch (error) {
    if (error instanceof GoalStoreError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    return { ok: false, error: { code: 'IO', message: `保存失败：${String(error)}` } }
  }
}

export function registerGoalsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GOALS_LIST, () => run((dir) => listGoals(dir)))
  ipcMain.handle(IPC_CHANNELS.GOALS_CREATE, (_event, input: GoalInput) =>
    run((dir) => createGoal(dir, input)))
  ipcMain.handle(IPC_CHANNELS.GOALS_UPDATE, (_event, id: string, revision: number, patch: GoalPatch) =>
    run((dir) => updateGoal(dir, id, revision, patch)))
  ipcMain.handle(IPC_CHANNELS.GOALS_ADD_COMMITMENT, (_event, id: string, revision: number, input: CommitmentInput) =>
    run((dir) => addCommitment(dir, id, revision, input)))
  ipcMain.handle(IPC_CHANNELS.GOALS_UPDATE_COMMITMENT, (_event, id: string, revision: number, commitmentId: string, status: CommitmentStatus) =>
    run((dir) => updateCommitment(dir, id, revision, commitmentId, status)))
  ipcMain.handle(IPC_CHANNELS.GOALS_ADD_DECISION, (_event, id: string, revision: number, input: DecisionInput) =>
    run((dir) => addDecision(dir, id, revision, input)))
  ipcMain.handle(IPC_CHANNELS.GOALS_ADD_CHECKIN, (_event, id: string, revision: number, input: CheckInInput) =>
    run((dir) => addCheckIn(dir, id, revision, input)))
  ipcMain.handle(IPC_CHANNELS.GOALS_LINK_COLLECTION, (_event, id: string, revision: number, collectionId: string, linked: boolean) =>
    run((dir) => linkGoalCollection(dir, id, revision, collectionId, linked)))
  ipcMain.handle(IPC_CHANNELS.GOALS_LINK_NOTE, (_event, id: string, revision: number, noteId: string, linked: boolean) =>
    run((dir) => linkNote(dir, id, revision, noteId, linked)))
}
