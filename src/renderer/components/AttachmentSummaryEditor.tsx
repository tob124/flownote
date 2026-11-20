import { useState } from 'react'
import { ATTACHMENT_SUMMARY_LIMIT } from '../../shared/attachment-summary'
import { Button } from './ui/Controls'

export default function AttachmentSummaryEditor({ name, summary, onSave, onClose }: {
  name: string; summary?: string; onSave: (summary: string) => void; onClose: () => void
}): JSX.Element {
  const [value, setValue] = useState(summary ?? '')
  return <form className="attachment-summary-editor" onSubmit={event => { event.preventDefault(); onSave(value.trim()) }}>
    <label>{`附件摘要 · ${name}`}<textarea autoFocus rows={3} maxLength={ATTACHMENT_SUMMARY_LIMIT}
      value={value} onChange={event => setValue(event.target.value)} /></label>
    <small>留空时，整理流程会跳过此附件。</small>
    <div><Button type="submit">保存摘要</Button><Button variant="quiet" onClick={onClose}>取消</Button></div>
  </form>
}
