import type { CheckInOutcome } from '../../shared/goals'

export interface ReviewDraft {
  observation: string
  outcome: CheckInOutcome
  nextStep: string
}
const EMPTY: ReviewDraft = { observation: '', outcome: 'progress', nextStep: '' }
function key(library: string, goalId: string): string {
  return `flownote:review-draft:${library}:${goalId}`
}
export function loadReviewDraft(storage: Pick<Storage, 'getItem'>, library: string, goalId: string): ReviewDraft {
  try {
    const raw = storage.getItem(key(library, goalId))
    if (!raw) return { ...EMPTY }
    const data = JSON.parse(raw) as Partial<ReviewDraft>
    return {
      observation: typeof data.observation === 'string' ? data.observation : '',
      outcome: ['progress', 'blocked', 'changed', 'unknown'].includes(data.outcome ?? '')
        ? data.outcome! : 'progress',
      nextStep: typeof data.nextStep === 'string' ? data.nextStep : ''
    }
  } catch { return { ...EMPTY } }
}
export function saveReviewDraft(
  storage: Pick<Storage, 'setItem' | 'removeItem'>, library: string, goalId: string, draft: ReviewDraft
): void {
  try {
    if (!draft.observation.trim() && !draft.nextStep.trim()) storage.removeItem(key(library, goalId))
    else storage.setItem(key(library, goalId), JSON.stringify(draft))
  } catch { /* the review form remains usable if local storage is unavailable */ }
}
