import { useEffect, useRef, useState } from 'react'
import { getDocument, PDFWorker, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import PdfRendererWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import { Button } from './ui/Controls'

export default function PdfPreview({ bytes }: { bytes: Uint8Array }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [rendered, setRendered] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let stale = false
    let port: Worker
    try { port = new PdfRendererWorker() }
    catch { setError('PDF 预览无法启动，可以用系统应用打开。'); return }
    port.addEventListener('error', () => {
      if (!stale) setError('PDF 预览无法启动，可以用系统应用打开。')
    })
    const worker: PDFWorker = PDFWorker.fromPort({ port })
    const loading = getDocument({
      data: new Uint8Array(bytes),
      worker, isEvalSupported: false, maxImageSize: 20_000_000, enableXfa: false,
      cMapUrl: 'flownote-file://pdf-data/cmaps/', cMapPacked: true,
      standardFontDataUrl: 'flownote-file://pdf-data/standard_fonts/', useWorkerFetch: false
    })
    void loading.promise.then(value => { if (!stale) setDocument(value) }).catch(reason => {
      if (!stale) setError(reason?.name === 'PasswordException'
        ? '这个 PDF 需要密码，请用系统应用打开。' : '无法预览此 PDF，可以用系统应用打开。')
    })
    return () => {
      stale = true
      void loading.destroy().catch(() => {}).finally(() => { worker.destroy(); port.terminate() })
    }
  }, [bytes])
  useEffect(() => {
    const element = canvas.current
    if (!document || !element) return
    let stale = false
    let drawing: RenderTask | undefined
    void document.getPage(pageNumber).then(page => {
      if (stale) return
      const original = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2.5, 1800 / Math.max(original.width, original.height)) })
      const context = element.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      element.width = Math.ceil(viewport.width)
      element.height = Math.ceil(viewport.height)
      drawing = page.render({ canvasContext: context, viewport })
      return drawing.promise
    }).then(() => { if (!stale) setRendered(pageNumber) }).catch(() => {
      if (!stale) setError('无法显示此 PDF 页面。')
    })
    return () => { stale = true; drawing?.cancel() }
  }, [document, pageNumber])
  if (error) return <p role="alert">{error}</p>
  if (!document) return <p role="status">正在读取 PDF…</p>
  return <section className="attachment-pdf" aria-label="PDF 预览">
    <nav aria-label="PDF 页码">
      <Button variant="quiet" disabled={pageNumber <= 1} onClick={() => { setRendered(0); setPageNumber(pageNumber - 1) }}>上一页</Button>
      <span role="status">{pageNumber} / {document.numPages}</span>
      <Button variant="quiet" disabled={pageNumber >= document.numPages} onClick={() => { setRendered(0); setPageNumber(pageNumber + 1) }}>下一页</Button>
    </nav>
    {rendered !== pageNumber && <p role="status">正在绘制页面…</p>}
    <canvas key={pageNumber} ref={canvas} role="img" aria-label={`第 ${pageNumber} 页`} hidden={rendered !== pageNumber}/>
  </section>
}
