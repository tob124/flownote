import { useRef, useState, type KeyboardEvent } from 'react'
import type { NoteFile } from '../../shared/types'
import { useNotes } from '../context/NotesContext'
import { useConfig } from '../context/ConfigContext'
import '../styles/quickinput.css'

// 轻量语音输入：浏览器原生 Web Speech API（非神经网络）
type SpeechRecognitionCtor = new () => SpeechRecognitionConfig

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

interface SpeechRecognitionConfig {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: {
    resultIndex: number
    results: ArrayLike<SpeechRecognitionResultLike>
  }) => void) | null
  onend: (() => void) | null
  onerror: ((e: unknown) => void) | null
}

interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}

export default function QuickInput(): JSX.Element {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<NoteFile[]>([])
  const [attaching, setAttaching] = useState(false)
  const { addNote } = useNotes()
  const { config } = useConfig()
  const recognitionRef = useRef<SpeechRecognitionConfig | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function saveNote(): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    const id = await addNote(trimmed)
    if (id) {
      // 保存成功后再把待附加的文件挂到该笔记上
      if (pendingFiles.length) {
        try {
          await window.api.files.attach(id, pendingFiles)
        } catch {
          setError('笔记已保存，但附件挂载失败，可稍后在卡片中重新添加')
        }
      }
      setText('')
      setPendingFiles([])
    }
    setSending(false)
  }

  async function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): Promise<void> {
    if (e.key === 'Enter' && e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      await saveNote()
    }
  }

  async function handleAttach(): Promise<void> {
    if (attaching) return
    setAttaching(true)
    setError(null)
    try {
      const files = await window.api.files.select()
      if (files && files.length) {
        setPendingFiles((prev) => [...prev, ...files])
      }
    } catch {
      setError('选择文件失败')
    } finally {
      setAttaching(false)
    }
  }

  function toggleListening(): void {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      setError(null)
      return
    }
    setError(null)
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('当前环境不支持语音输入，请使用键盘输入')
      return
    }
    let recognition: SpeechRecognitionConfig
    try {
      recognition = new Ctor()
    } catch {
      setError('语音识别初始化失败，请使用键盘输入')
      return
    }
    recognition.lang = 'zh-CN'
    // 只取最终结果，避免 interim 与 final 重复拼接
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (e) => {
      let finalText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) finalText += result[0].transcript
      }
      const addition = finalText.trim()
      if (addition) {
        setText((prev) => {
          const base = prev.trim()
          if (!base) return addition
          return base.endsWith(' ') || base.endsWith('\n')
            ? `${base}${addition}`
            : `${base} ${addition}`
        })
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = (err) => {
      setListening(false)
      const code = (err as { error?: string })?.error
      const msg =
        code === 'no-speech'
          ? '未检测到语音，请靠近麦克风再说一次'
          : code === 'network'
            ? '语音识别需要网络连接'
            : code === 'not-allowed'
              ? '未获得麦克风权限'
              : code === 'aborted'
                ? '已取消语音输入'
                : '语音识别出错，请使用键盘输入'
      setError(msg)
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      setError('语音识别启动失败，请使用键盘输入')
    }
  }

  async function handlePolish(): Promise<void> {
    if (!text.trim() || polishing) return
    setPolishing(true)
    setError(null)
    try {
      const result = await window.api.polish(text)
      if (result) setText(result)
    } catch {
      setError('润色失败，请稍后重试')
    } finally {
      setPolishing(false)
    }
  }

  const speechSupported = getSpeechRecognition() !== null
  const polishEnabled = Boolean(config.api_key) && text.trim().length > 0

  return (
    <div className={`quick-input-container${expanded ? ' expanded' : ''}`}>
      <div className="quick-input-toolbar">
        <span className="quick-input-hint">Alt + Enter 保存</span>
        <div className="quick-input-actions">
          {listening && <span className="quick-input-listening">正在聆听…</span>}
          <button
            className="quick-input-btn"
            onClick={() => void saveNote()}
            disabled={!text.trim() || sending}
            title="保存笔记（或按 Alt + Enter）"
          >
            {sending ? '…' : '💾 保存笔记'}
          </button>
          <button
            className="quick-input-btn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? '收拢文本框' : '展开文本框（适合大段输入）'}
          >
            {expanded ? '⤡ 收拢' : '⤢ 展开'}
          </button>
          <button
            className={`quick-input-btn${listening ? ' active' : ''}`}
            onClick={toggleListening}
            title={
              speechSupported ? '语音输入' : '语音输入（当前环境不支持，需使用键盘输入）'
            }
          >
            {listening ? '⏹' : '🎤'}
          </button>
          <button
            className="quick-input-btn"
            onClick={() => void handleAttach()}
            disabled={attaching}
            title="添加附件（随本次保存一起挂到笔记）"
          >
            {attaching ? '…' : '📎 附件'}
          </button>
          <button
            className="quick-input-btn"
            onClick={() => void handlePolish()}
            disabled={!polishEnabled || polishing}
            title="AI 润色（去口吃/语气词，不改顺序）"
          >
            {polishing ? '…' : '✨ 润色'}
          </button>
        </div>
      </div>
      {pendingFiles.length > 0 && (
        <div className="quick-input-pending">
          <span className="quick-input-hint">待附加：</span>
          {pendingFiles.map((f, i) => (
            <span key={f.storedName + i} className="quick-input-file-chip">
              📎 {f.name}
              <button
                onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                title="移除"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div className="quick-input-error">{error}</div>}
      <textarea
        className={`quick-input${expanded ? ' expanded' : ''}`}
        placeholder="记录灵感... (Alt + Enter 保存)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => void handleKeyDown(e)}
        disabled={sending}
        rows={3}
      />
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'right',
          marginTop: 4
        }}
      >
        {text.length} 字
      </div>
    </div>
  )
}