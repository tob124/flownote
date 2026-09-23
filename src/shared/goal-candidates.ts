import type { Note } from './types'
import type { GoalRecord } from './goals'
import type { CollectionRecord } from './collections'

export interface GoalNoteCandidate {
  note: Note
  matchedTerms: string[]
  score: number
}

const STOP_TERMS = new Set(['目标', '计划', '开始', '继续', '完成', '希望', '自己', '一个', '一些', '什么', '这个', '那个', '以及', '通过', '进行', '建立', '稳定', '未来'])

function termsFor(goal: GoalRecord): string[] {
  const source = `${goal.title} ${goal.success_signal ?? ''}`
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const terms: string[] = []
  for (const part of segmenter.segment(source)) {
    const term = part.segment.trim().toLocaleLowerCase()
    if (!part.isWordLike || STOP_TERMS.has(term)) continue
    if (/^[\p{Script=Han}]+$/u.test(term) ? term.length < 2 : term.length < 3) continue
    if (!terms.includes(term)) terms.push(term)
  }
  return terms.slice(0, 12)
}

/** Local, inspectable keyword suggestions; they never become evidence automatically. */
export function suggestGoalNotes(
  goal: GoalRecord, notes: Note[], limit = 5, collections: CollectionRecord[] = []
): GoalNoteCandidate[] {
  const terms = termsFor(goal)
  const linked = new Set(goal.evidence_note_ids)
  const topics = collections.filter((item) => goal.collection_ids?.includes(item.id))
  return notes
    .filter((note) => !linked.has(note.id))
    .map((note) => {
      const title = (note.title || '').toLocaleLowerCase()
      const tags = (note.tags || []).join(' ').toLocaleLowerCase()
      const body = (note.raw_content || '').toLocaleLowerCase()
      const topicReasons = topics.filter((item) => item.note_ids.includes(note.id)).map((item) => `知识库：${item.name}`)
      const matchedTerms = [...topicReasons, ...terms.filter((term) =>
        title.includes(term) || tags.includes(term) || body.includes(term))]
      const score = topicReasons.length * 4 + matchedTerms.filter((term) => !term.startsWith('知识库：')).reduce((sum, term) =>
        sum + (title.includes(term) ? 3 : 0) + (tags.includes(term) ? 2 : 0) +
        (body.includes(term) ? 1 : 0), 0)
      return { note, matchedTerms, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.note.id.localeCompare(a.note.id))
    .slice(0, limit)
}
