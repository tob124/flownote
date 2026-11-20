import {ActionMenu,Button,Icon} from './ui/Controls'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { NoteFile } from '../../shared/types'
import { useNotes } from '../context/NotesContext'
import { useConfig } from '../context/ConfigContext'
import '../styles/quickinput.css'
import { useDraftGuard } from '../utils/useDraftGuard'
import AttachmentSummaryEditor from './AttachmentSummaryEditor'
import MarkdownFormatBar from './MarkdownFormatBar'

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

const DRAFT_IDLE_MS = 650

function loadCaptureDraft(key: string): { text: string; files: NoteFile[] } {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return { text: typeof value?.text === 'string' ? value.text : '', files: Array.isArray(value?.files) ? value.files : [] }
  } catch { return { text: '', files: [] } }
}

export default function QuickInput({workspace=false,onSaved}:{workspace?:boolean;onSaved?:(id:string,warning?:string)=>void}): JSX.Element {
  const { config } = useConfig()
  const draftKey='flownote:capture:v1:'+config.sync_dir
  const [initial] = useState(() => loadCaptureDraft(draftKey))
  const persistedDraft = useRef(initial)
  const [text, setText] = useState(initial.text)
  const [composing, setComposing] = useState(false)
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [polishStatus, setPolishStatus] = useState('')
  useEffect(()=>{if(polishing || !polishStatus)return;const timer=setTimeout(()=>setPolishStatus(''),3500);return()=>clearTimeout(timer)},[polishing,polishStatus])
  const [error, setError] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState(initial.files)
  const [editingSummary, setEditingSummary] = useState<string | null>(null)
  const summaryFile = pendingFiles.find(file => file.storedName === editingSummary)
  const [attaching, setAttaching] = useState(false)
  const { addNote, savedId, revealNote } = useNotes()
  const recognitionRef = useRef<SpeechRecognitionConfig | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [clipOpen, setClipOpen] = useState(false)
  const [clipUrl, setClipUrl] = useState('')
  const [clipping, setClipping] = useState(false)
  const [clipError, setClipError] = useState('')
  const [clipStatus, setClipStatus] = useState('')
  const clipInput = useRef<HTMLInputElement>(null)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const deepseekConfigured = config.api_provider === 'DeepSeek' && Boolean(config.api_key?.trim())

  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;recognitionRef.current?.stop()}},[])
  useEffect(() => { if (clipOpen) clipInput.current?.focus() }, [clipOpen])
  const latestDraft = useRef(initial)
  latestDraft.current = { text, files: pendingFiles }
  const saveDraft = useCallback((showError = true): boolean => {
    const draft = latestDraft.current
    if (persistedDraft.current.text === draft.text && persistedDraft.current.files === draft.files) return true
    try {
      if (draft.text || draft.files.length) localStorage.setItem(draftKey, JSON.stringify(draft))
      else localStorage.removeItem(draftKey)
      persistedDraft.current = draft
      return true
    } catch {
      if (showError) setError('本机草稿无法保存，请先保存笔记再离开')
      return false
    }
  }, [draftKey])
  useDraftGuard(() => {
    if (summaryFile) { setError('请先保存或取消附件摘要编辑'); return false }
    if (sending || attaching || polishing || listening || clipping) {
      setError('请等待当前操作完成后再离开')
      return false
    }
    return saveDraft()
  })
  useEffect(() => {
    if (sending || composing) return
    const timer = setTimeout(saveDraft, DRAFT_IDLE_MS)
    return () => clearTimeout(timer)
  }, [saveDraft, text, pendingFiles, sending, composing])
  useEffect(() => () => { saveDraft(false) }, [saveDraft])

  async function clipPage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!deepseekConfigured || !clipUrl.trim() || clipping || sending || polishing || listening) return
    setClipping(true)
    setClipError('')
    setClipStatus('')
    setError(null)
    try {
      const clip = await window.api.notes.clipWeb(clipUrl.trim())
      if (!alive.current) return
      setPendingFiles(previous => [...previous, clip])
      setClipUrl('')
      setClipOpen(false)
      setClipStatus('网页已作为 Markdown 附件加入草稿。')
      textInput.current?.focus()
    } catch (reason) {
      if (alive.current) {
        const message = reason instanceof Error ? reason.message : String(reason)
        setClipError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
      }
    } finally {
      if (alive.current) setClipping(false)
    }
  }

  async function saveNote(): Promise<void> {
    const trimmed = text.trim()
    if ((!trimmed && !pendingFiles.length) || summaryFile || sending || polishing || clipping || attaching) return
    if (trimmed.length > 1_000_000) {
      setError('笔记超过 100 万字符，请缩短后保存')
      return
    }
    setSending(true)
    setError(null)
    const id = await addNote(trimmed, pendingFiles)
    if (!alive.current) return
    if (id) {
      const empty = { text: '', files: [] }
      latestDraft.current = empty
      try { localStorage.removeItem(draftKey); persistedDraft.current = empty } catch { /* save succeeded */ }
      setText('')
      setPendingFiles(empty.files)
      setClipStatus('')
    }
    setSending(false)
    if (id) onSaved?.(id)
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
    if (!text.trim() || polishing || sending || listening || clipping) return
    setPolishing(true)
    setPolishStatus('AI 正在润色…')
    setError(null)
    try {
      const result = await window.api.polish(text)
      if (!alive.current) return
      if (!result?.trim()) { setPolishStatus(''); setError('润色失败，AI 未返回内容；原文已保留'); return }
      setText(result)
      setPolishStatus(result === text ? 'AI 润色完成，文字无需调整' : 'AI 润色完成，请核对后保存')
    } catch {
      if(alive.current){setPolishStatus('');setError('润色失败，原文已保留，请稍后重试')}
    } finally {
      if(alive.current)setPolishing(false)
    }
  }

  const speechSupported = getSpeechRecognition() !== null
  const hasText = /\S/.test(text)
  const polishEnabled = deepseekConfigured && hasText

  return (
    <div className={'quick-input-container'+(expanded&&!workspace?' expanded':'')}>
      <label className="composer-label" htmlFor="quick-note">{workspace?'新建笔记':'写下一条记录'}</label>
      <MarkdownFormatBar input={textInput} onChange={setText} disabled={sending || polishing || composing}/>
      <textarea ref={textInput} id="quick-note" className={'quick-input'+(expanded&&!workspace?' expanded':'')}
        placeholder="此刻有什么值得记下来？" value={text} onChange={e=>setText(e.target.value)}
        onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
        onKeyDown={e=>void handleKeyDown(e)} disabled={sending||polishing} aria-busy={polishing} rows={3}/>
      {pendingFiles.length>0 && <div className="quick-input-pending">
        {pendingFiles.map(f=><span className="quick-input-file-chip" key={f.storedName}><Icon name="clip"/><span title={f.name}>{f.name}</span>
          <button type="button" disabled={sending} aria-label={'编辑附件摘要 '+f.name} onClick={()=>setEditingSummary(f.storedName)}>{f.summary?'摘要':'添加摘要'}</button>
          <button type="button" disabled={sending} aria-label={'移除附件 '+f.name} onClick={()=>{
            setPendingFiles(prev=>prev.filter(file=>file.storedName!==f.storedName))
            if (editingSummary===f.storedName) setEditingSummary(null)
          }}>×</button>
        </span>)}
      </div>}
      {summaryFile && <AttachmentSummaryEditor key={summaryFile.storedName} name={summaryFile.name} summary={summaryFile.summary}
        onClose={()=>{setEditingSummary(null);setError(null)}} onSave={summary=>{
          setPendingFiles(previous=>previous.map(file=>file.storedName===summaryFile.storedName ? {...file,summary} : file))
          setEditingSummary(null);setError(null)
        }} />}
      <div className="quick-input-toolbar">
        <div className="quick-input-actions">
          <Button variant="quiet" icon="clip" onClick={()=>void handleAttach()} disabled={attaching||sending}>{attaching?'正在添加…':'添加附件'}</Button>
          <ActionMenu label="输入工具" items={[
            ...(!workspace?[{label:expanded?'收起编辑区':'展开编辑区',icon:'expand' as const,onSelect:()=>setExpanded(v=>!v)}]:[]),
            {label:'剪藏网页',icon:'link',onSelect:()=>{setClipOpen(true);clipInput.current?.focus()}},
            {label:listening?'停止语音输入':'语音输入',icon:'mic',disabled:!speechSupported||polishing||sending||clipping,onSelect:toggleListening},
            {label:polishing?'正在润色…':'润色文字',icon:'spark',disabled:!polishEnabled||polishing||sending||listening||clipping,onSelect:()=>void handlePolish()}
          ]}/>
          {listening && <span role="status" className="quick-input-listening">正在聆听…</span>}
        </div>
        <div className="composer-save">
          <span className="quick-input-hint">{text.length?text.length+' 字 · ':''}Alt + Enter</span>
          <Button variant="primary" onClick={()=>void saveNote()} disabled={(!hasText&&!pendingFiles.length)||!!summaryFile||sending||polishing||clipping||attaching}>{sending?'正在保存…':'保存笔记'}</Button>
        </div>
      </div>
      {clipOpen && <form className="web-clip" onSubmit={event => void clipPage(event)}>
        <div className="web-clip-fields">
          <input ref={clipInput} type="url" aria-label="网页链接" aria-describedby="web-clip-help" placeholder="https://…"
            value={clipUrl} onChange={event => {setClipUrl(event.target.value); setClipError('')}} maxLength={8192} required disabled={clipping} />
          <Button type="submit" disabled={!deepseekConfigured||clipping||sending||polishing||listening}>{clipping?'正在抓取…':'抓取网页'}</Button>
          <Button variant="quiet" icon="close" iconOnly aria-label="关闭网页剪藏" disabled={clipping} onClick={()=>{setClipOpen(false);textInput.current?.focus()}} />
        </div>
        <small id="web-clip-help">{deepseekConfigured ? '链接将发送给 DeepSeek，抓取成功可能计费。' : '请先在设置中选择 DeepSeek 并填写 API 密钥。'}</small>
        {clipping && <span role="status" className="sr-only">正在抓取网页</span>}
        {clipError && <div role="alert" className="quick-input-error">{clipError}</div>}
      </form>}
      {clipStatus && <div className="web-clip-status" role="status">{clipStatus}</div>}
      {polishStatus && <p className="quick-input-polish-status" role="status" aria-live="polite">{polishStatus}</p>}
      {savedId && <div className="composer-receipt" role="status"><span>已保存到笔记</span><Button variant="quiet" onClick={()=>revealNote(savedId)}>查看笔记</Button></div>}
      {error && <div role="alert" className="quick-input-error">{error}</div>}
    </div>
  )
}
