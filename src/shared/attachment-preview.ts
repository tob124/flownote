const media = {
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'],
  gif: ['image', 'image/gif'], webp: ['image', 'image/webp'], bmp: ['image', 'image/bmp'],
  avif: ['image', 'image/avif'], ico: ['image', 'image/x-icon'],
  mp3: ['audio', 'audio/mpeg'], wav: ['audio', 'audio/wav'], flac: ['audio', 'audio/flac'],
  m4a: ['audio', 'audio/mp4'], aac: ['audio', 'audio/aac'], oga: ['audio', 'audio/ogg'],
  mp4: ['video', 'video/mp4'], m4v: ['video', 'video/mp4'], webm: ['video', 'video/webm'],
  ogg: ['audio', 'audio/ogg'], ogv: ['video', 'video/ogg']
} as const

export function mediaFormat(extension: string | undefined): { kind: 'image' | 'audio' | 'video'; mime: string } | undefined {
  const key = extension?.toLowerCase() ?? ''
  if (!Object.hasOwn(media, key)) return
  const [kind, mime] = media[key as keyof typeof media]
  return { kind, mime }
}

export function attachmentMediaUrl(noteId: string, storedName: string): string {
  return `flownote-file://attachment/${encodeURIComponent(noteId)}/${encodeURIComponent(storedName)}`
}

export type AttachmentPreviewData =
  | { kind: 'image' | 'audio' | 'video'; url: string }
  | { kind: 'markdown' | 'text'; text: string; truncated: boolean }
  | { kind: 'pdf'; bytes: Uint8Array }
  | { kind: 'unavailable'; message: string }
