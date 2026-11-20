import type { RefObject } from 'react'
import { Button } from './ui/Controls'

const commands = [
  ['bold', '加粗'], ['italic', '斜体'], ['list', '项目列表'], ['link', '插入链接']
] as const
type Command = typeof commands[number][0]

export function formatMarkdown(text: string, start: number, end: number, command: Command): {
  value: string; selection: [number, number]
} {
  const selected = text.slice(start, end)
  if (command === 'list') {
    const first = start > 0 ? text.lastIndexOf('\n', start - 1) + 1 : 0
    const lineEnd = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
    const last = lineEnd === -1 ? text.length : lineEnd
    const lines = text.slice(first, last).split('\n')
    const list = lines.some(line => line.trim())
      ? lines.map(line => line.trim() ? `- ${line}` : line).join('\n')
      : '- 列表项'
    return { value: text.slice(0, first) + list + text.slice(last), selection: [first + 2, first + list.length] }
  }

  const marker = command === 'bold' ? '**' : '*'
  const content = selected.trim()
  const leading = content ? selected.length - selected.trimStart().length : 0
  const trailing = content ? selected.length - selected.trimEnd().length : 0
  const before = text.slice(0, start + leading)
  const after = text.slice(end - trailing)
  const label = content || (command === 'link' ? '链接文字' : '文字')
  if (command === 'link') {
    const linkText = label.replace(/[\r\n]+/g, ' ').replace(/[\\\[\]]/g, '\\$&')
    const urlStart = before.length + linkText.length + 3
    return { value: before + `[${linkText}](https://)` + after, selection: [urlStart, urlStart + 8] }
  }
  const innerStart = before.length + marker.length
  return { value: before + marker + label + marker + after, selection: [innerStart, innerStart + label.length] }
}

export default function MarkdownFormatBar({ input, onChange, disabled }: {
  input: RefObject<HTMLTextAreaElement>; onChange: (value: string) => void; disabled?: boolean
}): JSX.Element {
  return <div className="markdown-format-bar" role="group" aria-label="Markdown 格式">
    {commands.map(([command, label]) => <Button key={command} variant="quiet" disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={() => {
        const editor = input.current
        if (!editor || editor.disabled) return
        const { value, selection } = formatMarkdown(editor.value, editor.selectionStart, editor.selectionEnd, command)
        if (editor.maxLength >= 0 && value.length > editor.maxLength) return
        onChange(value)
        requestAnimationFrame(() => {
          if (input.current !== editor || editor.value !== value) return
          editor.focus({ preventScroll: true })
          editor.setSelectionRange(...selection)
        })
      }}>{label}</Button>)}
  </div>
}
