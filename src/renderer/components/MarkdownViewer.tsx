import { useLayoutEffect, useRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeLine, slugify, type Heading } from '../utils/markdown'
import '../styles/markdown.css'

interface Props {
  content: string | null
  diffLines?: Set<string> | null
  highlightDiff?: boolean
  /** 真实渲染后测量得到的标题（与 DOM 中每个标题的 id 完全一致），供侧栏大纲与 minimap 共用 */
  onHeadings?: (headings: Heading[]) => void
}

function extractText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return extractText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

export default function MarkdownViewer({
  content,
  diffLines,
  highlightDiff,
  onHeadings
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // 把 id 直接写到真实渲染出来的标题 DOM 上：以渲染结果为准，
  // 不依赖任何解析猜测，因此 blockquote 内 / Setext / 代码块等边界情况下的
  // 每个标题都能拿到唯一且与侧栏一致的 id，点击跳转才能精确命中。
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      onHeadings?.([])
      return
    }
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')
    )
    const counts: Record<string, number> = {}
    const list: Heading[] = []
    for (const el of elements) {
      const level = Number(el.tagName[1])
      const text = (el.textContent || '').replace(/[*_`]/g, '').trim() || '标题'
      let base = slugify(text) || `h-${level}`
      counts[base] = (counts[base] || 0) + 1
      const id = counts[base] > 1 ? `${base}-${counts[base]}` : base
      el.id = id
      list.push({ level, text, id })
    }
    onHeadings?.(list)
    // 只随内容变化重测，避免因回调引用变化造成循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  if (!content) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)'
        }}
      >
        选择文件以查看内容
      </div>
    )
  }

  const isNew = (text: string): boolean => {
    return Boolean(highlightDiff && diffLines && text && diffLines.has(normalizeLine(text)))
  }

  // 标题（h1-h6）用默认渲染，id 由上方 useLayoutEffect 直接写到 DOM；
  // 这里只重写段落与引用以支持 diff 高亮。
  const components = {
    p: (props: Record<string, unknown>) => {
      const text = extractText(props.children)
      return <p className={isNew(text) ? 'diff-highlight' : undefined} {...(props as object)} />
    },
    blockquote: (props: Record<string, unknown>) => {
      const text = extractText(props.children)
      return (
        <blockquote
          className={isNew(text) ? 'diff-highlight' : undefined}
          {...(props as object)}
        />
      )
    }
  }

  return (
    <div ref={containerRef} className="markdown-body" style={{ flex: 1, overflowY: 'auto' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}