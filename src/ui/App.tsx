import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExifReader from 'exifreader'
import heic2any from 'heic2any'
import { MapView } from './MapView'
import { parseGpsFromExif } from '../utils/gps'
import { buildExifSummary, generatePreviewBase64 } from '../utils/summary'
import { convertHeicToJpegBlob } from '../utils/heic'
import { FolderUpload } from './FolderUpload'
import { BatchConverter } from './BatchConverter'

type MetadataMap = Record<string, unknown>

type ParsedTag = {
  key: string
  label: string
  value: string
}

type EditorFilter = 'none' | 'grayscale' | 'sepia' | 'invert' | 'contrast'

type EditorState = {
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
  filter: EditorFilter
}

const EDITOR_FILTER_CSS: Record<EditorFilter, string> = {
  none: 'none',
  grayscale: 'grayscale(100%)',
  sepia: 'sepia(85%)',
  invert: 'invert(100%)',
  contrast: 'contrast(115%) saturate(120%)',
}

const FILTER_OPTIONS: { label: string; value: EditorFilter }[] = [
  { label: 'Grayscale', value: 'grayscale' },
  { label: 'Sepia', value: 'sepia' },
  { label: 'Invert', value: 'invert' },
  { label: 'Punch', value: 'contrast' },
]

const DEFAULT_EDITOR_STATE: EditorState = Object.freeze({
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  filter: 'none' as EditorFilter,
})

const createDefaultEditorState = (): EditorState => ({
  rotation: DEFAULT_EDITOR_STATE.rotation,
  flipHorizontal: DEFAULT_EDITOR_STATE.flipHorizontal,
  flipVertical: DEFAULT_EDITOR_STATE.flipVertical,
  filter: DEFAULT_EDITOR_STATE.filter,
})

const normaliseRotation = (value: number) => {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const chooseCanvasMime = (input?: string | null) => {
  if (!input) return 'image/jpeg'
  const lower = input.toLowerCase()
  if (lower.includes('png')) return 'image/png'
  if (lower.includes('webp')) return 'image/webp'
  if (lower.includes('jpg') || lower.includes('jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

const getCanvasQuality = (mime: string) => (mime === 'image/jpeg' ? 0.95 : undefined)

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for editing.'))
    img.src = src
  })
}

async function renderEditorStateToBlob(sourceUrl: string, state: EditorState, mimeHint?: string | null): Promise<Blob> {
  const image = await loadImageElement(sourceUrl)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) {
    throw new Error('Image dimensions are unavailable for editing.')
  }

  const rotation = normaliseRotation(state.rotation)
  const swapDimensions = rotation % 180 !== 0
  const canvas = document.createElement('canvas')
  canvas.width = swapDimensions ? height : width
  canvas.height = swapDimensions ? width : height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas rendering is not supported in this browser.')
  }

  context.filter = EDITOR_FILTER_CSS[state.filter] ?? 'none'
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.scale(state.flipHorizontal ? -1 : 1, state.flipVertical ? -1 : 1)
  context.drawImage(image, -width / 2, -height / 2)

  const mime = chooseCanvasMime(mimeHint)
  const quality = getCanvasQuality(mime)

  return new Promise((resolve, reject) => {
    const handleBlob = (result: Blob | null, fallbackError?: unknown) => {
      if (result) {
        resolve(result)
        return
      }
      try {
        const dataUrl = canvas.toDataURL(mime, quality)
        const base64Data = dataUrl.split(',')[1]
        if (!base64Data) {
          throw new Error('Failed to export edited image.')
        }
        const byteString = atob(base64Data)
        const array = new Uint8Array(byteString.length)
        for (let i = 0; i < byteString.length; i += 1) {
          array[i] = byteString.charCodeAt(i)
        }
        resolve(new Blob([array], { type: mime }))
      } catch (error) {
        if (fallbackError instanceof Error) {
          reject(fallbackError)
        } else if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error('Failed to export edited image.'))
        }
      }
    }

    try {
      canvas.toBlob(blob => handleBlob(blob), mime, quality)
    } catch (err) {
      handleBlob(null, err)
    }
  })
}

function formatTagValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(v => formatTagValue(v)).join(', ')
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }
  return String(value)
}

function parseTags(tags: MetadataMap): ParsedTag[] {
  const entries: ParsedTag[] = []
  for (const [key, tag] of Object.entries(tags)) {
    if (key === 'thumbnail') continue
    const label = (tag as any)?.description ?? key
    const value = formatTagValue((tag as any)?.value ?? (tag as any))
    entries.push({ key, label, value })
  }
  entries.sort((a, b) => a.key.localeCompare(b.key))
  return entries
}

function createEditedFileName(originalName: string, options?: { extension?: string; folder?: string }) {
  const dotIndex = originalName.lastIndexOf('.')
  const base = dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName
  const ext = options?.extension ?? (dotIndex >= 0 ? originalName.slice(dotIndex) : '')
  const suffix = '-edited'
  const fileName = `${base}${suffix}${ext}`
  if (options?.folder) {
    return `${options.folder}/${fileName}`
  }
  return fileName
}

export function App() {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [rawTags, setRawTags] = useState<MetadataMap | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [editedObjectUrl, setEditedObjectUrl] = useState<string | null>(null)
  const [editedBlobState, setEditedBlobState] = useState<Blob | null>(null)
  const [editedFileName, setEditedFileName] = useState<string | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [isLargeMap, setIsLargeMap] = useState<boolean>(false)
  const [fullscreen, setFullscreen] = useState<boolean>(false)
  const [showMeta, setShowMeta] = useState<boolean>(false)
  const [preferLibheif, setPreferLibheif] = useState<boolean>(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([{ role: 'assistant', content: 'Hi! Ready to help you edit the photo—what would you like to change?' }])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [keywords, setKeywords] = useState<string[]>([])
  const [detailedDescription, setDetailedDescription] = useState<string | null>(null)
  const [descriptionSource, setDescriptionSource] = useState<'model' | 'fallback' | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Batch processing state
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [processedFiles, setProcessedFiles] = useState<any[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null)
  const [showFolderSelector, setShowFolderSelector] = useState(false)

  // Batch converter state
  const [showBatchConverter, setShowBatchConverter] = useState(false)

  // Inline editor state
  const [showEditor, setShowEditor] = useState(false)
  const [editorHistory, setEditorHistory] = useState<EditorState[]>([])
  const [editorIndex, setEditorIndex] = useState<number>(-1)
  const [editorPreviewUrl, setEditorPreviewUrl] = useState<string | null>(null)
  const [editorBaseUrl, setEditorBaseUrl] = useState<string | null>(null)
  const [editorBaseBlob, setEditorBaseBlob] = useState<Blob | null>(null)
  const [editorMime, setEditorMime] = useState<string>('image/jpeg')
  const [editorRenderedBlob, setEditorRenderedBlob] = useState<Blob | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [isRenderingEdit, setIsRenderingEdit] = useState(false)

  const parsed = useMemo(() => rawTags ? parseTags(rawTags) : [], [rawTags])

  const clampNormalized = (v: number, margin = 0.01) => Math.max(margin, Math.min(1 - margin, v))

  // One-shot caption placement: measure text and clamp within margins, possibly shrinking
  const measureAndPlaceCaption = useCallback((args: {
    text: string
    preferredX: number
    preferredY: number
    preferredAnchor?: 'tl'|'tc'|'tr'|'cl'|'cc'|'cr'|'bl'|'bc'|'br'
    preferredSizePct?: number
    weight?: number
    marginPct?: number
    stageWidth: number
    stageHeight: number
  }) => {
    const {
      text,
      preferredX,
      preferredY,
      preferredAnchor = 'bc',
      preferredSizePct = 5,
      weight = 700,
      marginPct = 1.5,
      stageWidth: W,
      stageHeight: H,
    } = args

    const maxSide = Math.max(W, H)
    const marginPx = (marginPct / 100) * maxSide

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { x: clampNormalized(preferredX), y: clampNormalized(preferredY), anchor: preferredAnchor, sizePct: preferredSizePct }
    }

    let sizePct = preferredSizePct
    let anchor = preferredAnchor
    const anchorOffset = (aw: number, ah: number, a: string) => {
      switch (a) {
        case 'tl': return { ox: 0, oy: 0 }
        case 'tc': return { ox: aw / 2, oy: 0 }
        case 'tr': return { ox: aw, oy: 0 }
        case 'cl': return { ox: 0, oy: ah / 2 }
        case 'cc': return { ox: aw / 2, oy: ah / 2 }
        case 'cr': return { ox: aw, oy: ah / 2 }
        case 'bl': return { ox: 0, oy: ah }
        case 'br': return { ox: aw, oy: ah }
        case 'bc':
        default: return { ox: aw / 2, oy: ah }
      }
    }

    const fitLoop = () => {
      for (let i = 0; i < 12; i += 1) {
        const fontPx = Math.max(10, Math.round((sizePct / 100) * maxSide))
        ctx.font = `${weight || 700} ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial`
        const metrics = ctx.measureText(text)
        const textWidth = metrics.width
        const ascent = Math.max(metrics.actualBoundingBoxAscent || fontPx * 0.8, 1)
        const descent = Math.max(metrics.actualBoundingBoxDescent || fontPx * 0.2, 1)
        const textHeight = ascent + descent

        const { ox, oy } = anchorOffset(textWidth, textHeight, anchor)
        let px = preferredX * W - ox
        let py = preferredY * H - oy

        // Clamp to margins
        if (px < marginPx) px = marginPx
        if (py < marginPx) py = marginPx
        if (px + textWidth > W - marginPx) px = Math.max(marginPx, W - marginPx - textWidth)
        if (py + textHeight > H - marginPx) py = Math.max(marginPx, H - marginPx - textHeight)

        // If still doesn't fit horizontally, shrink and retry
        const fits = textWidth <= (W - 2 * marginPx) && textHeight <= (H - 2 * marginPx)
        if (!fits) {
          sizePct = Math.max(1, sizePct * 0.9)
          continue
        }

        const outX = clampNormalized((px + ox) / W, marginPct / 100)
        const outY = clampNormalized((py + oy) / H, marginPct / 100)
        return { x: outX, y: outY, sizePct, anchor }
      }
      return { x: clampNormalized(preferredX), y: clampNormalized(preferredY), sizePct: Math.max(1, preferredSizePct * 0.7), anchor }
    }

    return fitLoop()
  }, [])

  type Caption = {
    id: string
    text: string
    x: number
    y: number
    sizePct: number
    color: string
    stroke?: string
    weight?: number
    anchor?: 'tl'|'tc'|'tr'|'cl'|'cc'|'cr'|'bl'|'bc'|'br'
  }

  const [captions, setCaptions] = useState<Caption[]>([])
  const lastCaption = useMemo<Caption>(() => captions[captions.length - 1] ?? {
    id: 'initial',
    text: '',
    x: 0.5,
    y: 0.9,
    sizePct: 5,
    color: '#FFD400',
    stroke: '#000000',
    weight: 700,
    anchor: 'bc',
  }, [captions])

  const captionDragRef = useRef<{ dragging: boolean; startX: number; startY: number; } | null>(null)

  const onCaptionPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect()
    if (!rect) return
    captionDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY }
    e.currentTarget.classList.add('dragging')
  }, [])

  const onCaptionPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!captionDragRef.current?.dragging) return
    const stage = (e.currentTarget.parentElement as HTMLElement)
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const nx = clampNormalized((e.clientX - rect.left) / rect.width)
    const ny = clampNormalized((e.clientY - rect.top) / rect.height)
    setCaptions((prev: Caption[]): Caption[] => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1] as Caption
      const updated: Caption = { ...last, x: nx, y: ny }
      return [...prev.slice(0, -1), updated]
    })
  }, [])

  const onCaptionPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    captionDragRef.current = null
    e.currentTarget.classList.remove('dragging')
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 20)
    return () => window.clearTimeout(id)
  }, [chatMessages, chatLoading])

  const handleFolderProcessed = (folderName: string, files: any[]) => {
    setCurrentFolder(folderName)
    setProcessedFiles(files)
    setShowFolderSelector(true)
    setFileError(null)
    setImageError(null)
  }

  const handleBatchConversionComplete = (outputFolder: string, convertedCount: number) => {
    alert(`Batch conversion complete!\n\nOutput folder: ${outputFolder}\nFiles converted: ${convertedCount}`)
    setShowBatchConverter(false)
  }

  const handleChatSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (chatLoading) return

      const trimmed = chatInput.trim()
      if (!trimmed) return

      const userMessage = { role: 'user' as const, content: trimmed }
      const nextMessages = [...chatMessages, userMessage]

      setChatMessages(nextMessages)
      setChatInput('')
      setChatLoading(true)
      setChatError(null)

      const editedMeta = editedBlobState
        ? {
            name: editedFileName ?? 'edited-photo.jpg',
            mimeType: editedBlobState.type || 'image/jpeg',
            size: editedBlobState.size,
          }
        : editedObjectUrl
        ? {
            name: editedFileName ?? 'edited-preview.jpg',
            mimeType: 'image/jpeg',
          }
        : null

      const originalMeta = selectedPhoto?.originalFile
        ? {
            name: selectedPhoto.originalFile.name,
            mimeType: selectedPhoto.originalFile.type || null,
          }
        : fileName
        ? {
            name: fileName,
            mimeType: null,
          }
        : null

      const currentEditorState = editorIndex >= 0 ? editorHistory[editorIndex] ?? null : null

      // Create small base64 preview to give the model visual context
      const previewBase64 = await generatePreviewBase64(editedObjectUrl || objectUrl)

      const exifSummary = buildExifSummary(rawTags as any, gps)

      const assistantEndpoint = (import.meta as any)?.env?.VITE_ASSISTANT_URL ?? 'http://localhost:3001/api/assistant'

      try {
        const response = await fetch(assistantEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: nextMessages,
            editedPhoto: editedMeta,
            originalPhoto: originalMeta,
            editorState: currentEditorState,
            imagePreview: previewBase64,
            exifSummary,
            captionState: lastCaption,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          if (response.status === 503 && (data?.errorCode === 'LLM_API_KEY_MISSING' || data?.errorCode === 'LLM_AUTH_FAILED')) {
            setChatMessages([{ role: 'assistant', content: 'No LLM API key found or authentication failed. Add OPENAI_API_KEY in .env and reload, then try again.' }])
            setChatLoading(false)
            return
          }
          throw new Error(data?.error ?? `Assistant request failed (${response.status})`)
        }
        let assistantText =
          typeof data?.assistantMessage === 'string' && data.assistantMessage.trim().length > 0
            ? data.assistantMessage.trim()
            : 'I am ready to keep editing—what would you like next?'

        if (Array.isArray(data?.actions) && data.actions.length > 0) {
          const actionLines = data.actions
            .map((action: any) => {
              const valueText = action?.value ? ` ${JSON.stringify(action.value)}` : ''
              return `• ${action.type}${valueText}`
            })
            .join('\n')
          assistantText = `${assistantText}\n\nSuggested actions:\n${actionLines}`
        }

        // Apply structured actions to caption overlay
        if (Array.isArray(data?.actions)) {
          for (const action of data.actions) {
            const type = action?.type
            const value = action?.value || {}
            if (type === 'set_caption') {
              // One‑shot placement with measurement and clamping
              const stageEl = document.querySelector('.edited-stage img') as HTMLImageElement | null
              const stageW = stageEl?.naturalWidth || stageEl?.width || 0
              const stageH = stageEl?.naturalHeight || stageEl?.height || 0
              const measured = stageW && stageH && value?.text
                ? measureAndPlaceCaption({
                    text: String(value.text),
                    preferredX: typeof value.x === 'number' ? value.x : (typeof value.cx === 'number' ? value.cx : lastCaption.x),
                    preferredY: typeof value.y === 'number' ? value.y : (typeof value.cy === 'number' ? value.cy : lastCaption.y),
                    preferredAnchor: value.anchor ?? lastCaption.anchor,
                    preferredSizePct: typeof value.sizePct === 'number' ? value.sizePct : lastCaption.sizePct,
                    weight: (typeof value.weight === 'number' ? value.weight : lastCaption.weight) || 700,
                    marginPct: 1.5,
                    stageWidth: stageW,
                    stageHeight: stageH,
                  })
                : null

              const newCaption: Caption = {
                id: (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : String(Date.now()),
                text: value.text ?? lastCaption.text,
                x: measured ? measured.x : (typeof value.x === 'number' ? clampNormalized(value.x) : (typeof value.cx === 'number' ? clampNormalized(value.cx) : lastCaption.x)),
                y: measured ? measured.y : (typeof value.y === 'number' ? clampNormalized(value.y) : (typeof value.cy === 'number' ? clampNormalized(value.cy) : lastCaption.y)),
                anchor: measured ? measured.anchor : (value.anchor ?? lastCaption.anchor),
                sizePct: measured ? measured.sizePct : (typeof value.sizePct === 'number' ? value.sizePct : lastCaption.sizePct),
                color: value.color ?? lastCaption.color,
                stroke: value.stroke ?? lastCaption.stroke,
                weight: typeof value.weight === 'number' ? value.weight : lastCaption.weight,
              }
              setCaptions(prev => [...prev, newCaption])
            } else if (type === 'move_caption' || type === 'suggest_position') {
              // Move the last caption by default
              setCaptions((prev: Caption[]) => {
                if (prev.length === 0) return prev
                const last = prev[prev.length - 1] as Caption
                const hasDx = typeof value.dx === 'number'
                const hasDy = typeof value.dy === 'number'
                const nextX = hasDx
                  ? clampNormalized(last.x + value.dx)
                  : (typeof value.x === 'number' ? clampNormalized(value.x) : last.x)
                const nextY = hasDy
                  ? clampNormalized(last.y + value.dy)
                  : (typeof value.y === 'number' ? clampNormalized(value.y) : last.y)
                const updated = { ...last, x: nextX, y: nextY, anchor: value.anchor ?? last.anchor }
                return [...prev.slice(0, -1), updated]
              })
            } else if (type === 'style_caption') {
              setCaptions((prev: Caption[]) => {
                if (prev.length === 0) return prev
                const last = prev[prev.length - 1] as Caption
                const updated = {
                  ...last,
                  sizePct: typeof value.sizePct === 'number' ? value.sizePct : last.sizePct,
                  color: value.color ?? last.color,
                  stroke: value.stroke ?? last.stroke,
                  weight: typeof value.weight === 'number' ? value.weight : last.weight,
                }
                return [...prev.slice(0, -1), updated]
              })
            }
          }
        }

        setChatMessages(prev => [...prev, { role: 'assistant', content: assistantText }])
      } catch (error: any) {
        console.error('Chat assistant error:', error)
        setChatError(error?.message ?? 'Assistant request failed')
        setChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I ran into an error while planning that edit. Please try again.',
          },
        ])
      } finally {
        setChatLoading(false)
      }
    },
    [
      chatInput,
      chatLoading,
      chatMessages,
      editedBlobState,
      editedFileName,
      editedObjectUrl,
      editorHistory,
      editorIndex,
      fileName,
      selectedPhoto,
    ]
  )

  const handlePhotoSelect = useCallback((photo: any) => {
    setEditedBlobState(null)

    setSelectedPhoto(photo)

    console.log('🔄 Processing selected photo:', photo?.originalFile?.name)

    // For HEIC files, always use the converted blob (JPEG), never the original HEIC
    let displayUrl: string
    let displayBlob: Blob | null = null
    let editedBlob: Blob | null = null
    ;(window as any).__currentEditedBlob = null
    const isHeicFile = photo.originalFile.name.match(/\.(heic|heif)$/i) || photo.originalFile.type === 'image/heic' || photo.originalFile.type === 'image/heif'

    if (isHeicFile) {
      // HEIC file - must use converted blob
      if (photo.convertedBlob) {
        displayBlob = photo.convertedBlob
        displayUrl = URL.createObjectURL(photo.convertedBlob)
        editedBlob = photo.convertedBlob
        console.log('✅ Using converted JPEG for HEIC file display, blob size:', photo.convertedBlob.size, 'type:', photo.convertedBlob.type)

        // Set up download for this converted blob
        console.log('💾 Setting up download for converted HEIC file:', photo.originalFile.name)
        ;(window as any).__currentConvertedBlob = photo.convertedBlob
        ;(window as any).__convertedFileName = photo.originalFile.name.replace(/\.(heic|heif)$/i, '.jpg')

        console.log('✅ Blob stored globally for download')
        console.log('✅ Filename stored as:', (window as any).__convertedFileName)

      } else {
        console.error('❌ HEIC file has no converted blob! Photo data:', photo)
        displayUrl = photo.previewUrl || ''
        console.log('⚠️ Falling back to preview URL for HEIC file')
      }
    } else {
      // Non-HEIC file - use original or converted blob
      if (photo.convertedBlob) {
        displayBlob = photo.convertedBlob
        displayUrl = URL.createObjectURL(photo.convertedBlob)
        editedBlob = photo.convertedBlob
        console.log('Using converted blob for non-HEIC file, size:', photo.convertedBlob.size)
      } else {
        displayUrl = photo.previewUrl
      }
    }

    setObjectUrl(displayUrl)
    setFileName(photo.originalFile.name)
    setFileSize(photo.originalFile.size)

    const generatedEditedName = createEditedFileName(photo.originalFile.name)
    const existingEditedEntry = processedFiles.find(entry => entry?.originalFile?.name === generatedEditedName)
    const finalEditedFileName = existingEditedEntry?.originalFile?.name ?? generatedEditedName
    setEditedFileName(finalEditedFileName)
    setRawTags(photo.metadata)
    setGps(parseGpsFromExif(photo.metadata))
    setFileError(null)
    setImageError(null)
    setShowMeta(false)

    // Set up download function if we have a converted blob
    if (displayBlob) {
      console.log('🔧 Setting up download function for blob:', displayBlob.size, 'bytes')

      // Create the download function
      ;(window as any).__saveConvertedImage = () => {
        const blob = (window as any).__currentConvertedBlob
        const filename = (window as any).__convertedFileName

        console.log('🖱️ SAVE BUTTON CLICKED - STARTING DOWNLOAD')
        console.log('📁 File to save:', filename)
        console.log('📊 Blob size:', blob?.size, 'Type:', blob?.type)

        if (blob && filename) {
          try {
            console.log('✅ Starting download process...')

            // Show immediate feedback
            const downloadsPath = 'C:\\Users\\YourName\\Downloads\\' // Windows typical path
            console.log(`💾 SAVING FILE: ${filename}`)
            console.log(`📂 SAVE LOCATION: ${downloadsPath}${filename}`)
            console.log('🔄 Browser download dialog should appear now...')

            const downloadUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = downloadUrl
            link.download = filename
            link.style.display = 'none'

            console.log('🔗 Download link created, triggering click...')
            document.body.appendChild(link)
            link.click()

            // Verify the click worked
            console.log('✅ Click event fired - file should be downloading')

            // Clean up after a delay
            setTimeout(() => {
              document.body.removeChild(link)
              URL.revokeObjectURL(downloadUrl)
              console.log('🧹 Download resources cleaned up')
              console.log(`✅ FILE SAVED: ${filename} to Downloads folder`)
            }, 1000)

            } catch (error) {
              const err = error as any
              console.error('❌ DOWNLOAD ERROR:', err)
              console.error('Error details:', err?.message)
              alert(`❌ Download failed: ${err?.message || 'Unknown error'}`)
          }
        } else {
          console.error('❌ CANNOT SAVE: No converted image available')
          console.log('Blob exists:', !!blob)
          console.log('Filename exists:', !!filename)
          if (!blob) console.log('💡 Try reloading the HEIC file to regenerate the converted blob')
          if (!filename) console.log('💡 Filename should be available after successful conversion')
          alert('❌ No converted image available for download. Please reload the file.')
        }
      }

      console.log('✅ Download function created successfully')
    }

    // Prepare edited object URL preview
    let finalEditedBlob: Blob | null = null
    let finalEditedUrl: string | null = null

    if (existingEditedEntry) {
      finalEditedBlob = existingEditedEntry.convertedBlob ?? existingEditedEntry.originalFile ?? null
      finalEditedUrl = existingEditedEntry.previewUrl ?? (finalEditedBlob ? URL.createObjectURL(finalEditedBlob) : null)
    } else if (editedBlob) {
      finalEditedBlob = editedBlob
      finalEditedUrl = URL.createObjectURL(editedBlob)
    } else if (displayBlob) {
      finalEditedBlob = displayBlob
      finalEditedUrl = URL.createObjectURL(displayBlob)
    } else if (photo.previewUrl) {
      finalEditedUrl = photo.previewUrl
    }

    setEditedBlobState(finalEditedBlob)
    ;(window as any).__currentEditedBlob = finalEditedBlob
    setEditedObjectUrl(finalEditedUrl)

    // Immediately show standby analyzing message
    setChatMessages([{ role: 'assistant', content: 'Analyzing photo… please stand by.' }])

    // Trigger dynamic welcome generation using preview and EXIF summary
    ;(async () => {
      try {
        const summarized = buildExifSummary(photo?.metadata as any, parseGpsFromExif(photo.metadata as any))

        // Create small preview (reuse edited or original preview)
        const src = finalEditedUrl || displayUrl || photo.previewUrl
        const previewBase64 = await generatePreviewBase64(src)

        const welcomeEndpoint = (import.meta as any)?.env?.VITE_WELCOME_URL ?? 'http://localhost:3001/api/welcome'
        const resp = await fetch(welcomeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePreview: previewBase64, exifSummary: summarized }),
        })
        console.log('[ui] welcome request', { hasPreview: !!previewBase64, previewLen: previewBase64?.length || 0, hasExif: !!summarized })
        const data = await resp.json()
        console.log('[ui] welcome response', { status: resp.status, hasKeywords: Array.isArray(data?.keywords), hasDescription: !!data?.detailedDescription, descriptionSource: data?.descriptionSource, hasAnalysis: !!data?.analysis })
        if (resp.ok && typeof data?.welcomeMessage === 'string' && data.welcomeMessage.trim()) {
          const descText = typeof data?.detailedDescription === 'string' && data.detailedDescription.trim().length > 0 ? data.detailedDescription.trim() : null
          const firstMessage = descText ?? data.welcomeMessage.trim()
          setChatMessages([{ role: 'assistant', content: firstMessage }])
          if (!descText || data?.descriptionSource === 'fallback') {
            setChatMessages(prev => [
              ...prev,
              { role: 'assistant', content: 'Note: Using metadata/tags for the initial greeting; visual description was unavailable.' },
            ])
          }
          if (Array.isArray(data?.keywords)) setKeywords(data.keywords)
          if (typeof data?.detailedDescription === 'string') setDetailedDescription(data.detailedDescription)
          if (data?.descriptionSource === 'model' || data?.descriptionSource === 'fallback') setDescriptionSource(data.descriptionSource)
          // (Diagnostics removed from chat to avoid confusing messaging)
        } else if (resp.status === 503 && (data?.errorCode === 'LLM_API_KEY_MISSING' || data?.errorCode === 'LLM_AUTH_FAILED')) {
          setChatMessages([{ role: 'assistant', content: 'No LLM API key found or authentication failed. Add OPENAI_API_KEY in .env and reload, then try again.' }])
        }
      } catch {
        // Non-fatal; keep standby or default
      }
    })()
  }, [editedObjectUrl, objectUrl, processedFiles])

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Clear previous errors and state
    setFileError(null)
    setImageError(null)
    setFileName(file.name)
    setFileSize(file.size)
    
    // Immediately show standby analyzing message
    setChatMessages([{ role: 'assistant', content: 'Analyzing photo… please stand by.' }])
    
    // Validate file type
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    const isSupportedType = supportedTypes.includes(file.type) || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(file.name)
    
    if (!isSupportedType) {
      setFileError(`Unsupported file type: ${file.type || 'unknown'}. Supported formats: JPEG, PNG, GIF, WebP, HEIC, HEIF`)
      return
    }
    
    // Check file size (warn if > 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setFileError(`Large file detected (${(file.size / 1024 / 1024).toFixed(1)}MB). Processing may be slow.`)
    }
    
        // Prepare preview: Convert HEIC/HEIF to JPEG for browsers that can't display HEIC
        const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
        try {
          let previewBlob: Blob | null = null
          let conversionError: string | null = null

          if (isHeic) {
            console.log('HEIC file detected - converting to JPEG for browser compatibility...')

            try {
              // Convert HEIC to JPEG using heic2any
              console.log('Attempting heic2any conversion...')
              const converted = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.95
              })

              const jpegBlob = (Array.isArray(converted) ? converted[0] : converted) as Blob | undefined
              console.log('HEIC conversion successful:', {
                originalSize: file.size,
                convertedSize: jpegBlob?.size,
                type: jpegBlob?.type
              })

              // Verify the conversion actually worked
              if (jpegBlob && jpegBlob.size > 0) {
                previewBlob = jpegBlob
                console.log('Preview blob set to converted JPEG')
              } else {
                throw new Error('Conversion produced empty or invalid blob')
              }

            } catch (heic2anyErr) {
              console.warn('heic2any failed:', heic2anyErr)

              try {
                // Try libheif as fallback
                console.log('Attempting libheif conversion...')
                const jpegBlob = await convertHeicToJpegBlob(file, 0.95)
                console.log('libheif conversion successful:', {
                  originalSize: file.size,
                  convertedSize: jpegBlob.size,
                  type: jpegBlob.type
                })

                if (jpegBlob && jpegBlob.size > 0) {
                  previewBlob = jpegBlob
                  console.log('Preview blob set to libheif converted JPEG')
                } else {
                  throw new Error('libheif conversion produced empty or invalid blob')
                }

              } catch (libheifErr) {
                console.error('libheif conversion failed:', libheifErr)

                // Final fallback: try to extract EXIF thumbnail
                try {
                  console.log('Trying EXIF thumbnail extraction...')
                  const arrayBuffer = await file.arrayBuffer()
                  const tags = await ExifReader.load(arrayBuffer)

                  const possibleThumbnails = [
                    'thumbnail', 'Thumbnail', 'JPEGThumbnail', 'PreviewImage',
                    'ThumbnailImage', 'Preview', 'JPEGPreview', 'ThumbnailData'
                  ]

                  for (const field of possibleThumbnails) {
                    const tn = (tags as any)?.[field]
                    if (tn) {
                      const tnVal = tn?.value ?? tn?.data ?? tn
                      if (tnVal) {
                        let thumbBlob: Blob | null = null
                        if (tnVal instanceof Blob) {
                          thumbBlob = tnVal
                        } else if (tnVal instanceof ArrayBuffer) {
                          // ArrayBuffer is acceptable as a BlobPart directly
                          thumbBlob = new Blob([tnVal], { type: 'image/jpeg' })
                        } else if (ArrayBuffer.isView(tnVal) && tnVal.buffer) {
                          const view = tnVal as ArrayBufferView
                          const copy = new Uint8Array(view.byteLength)
                          copy.set(new Uint8Array(view.buffer as ArrayBufferLike, view.byteOffset, view.byteLength))
                          thumbBlob = new Blob([copy], { type: 'image/jpeg' })
                        } else if (tnVal instanceof Uint8Array) {
                          const view = tnVal as Uint8Array
                          const copy = new Uint8Array(view.byteLength)
                          copy.set(view)
                          thumbBlob = new Blob([copy], { type: 'image/jpeg' })
                        }

                        if (thumbBlob && thumbBlob.size > 0) {
                          previewBlob = thumbBlob
                          console.log('Using EXIF thumbnail as fallback, size:', thumbBlob.size)
                          break
                        }
                      }
                    }
                  }

                  if (!previewBlob) {
                    throw new Error('No EXIF thumbnail found')
                  }

                } catch (thumbErr) {
                  console.error('EXIF thumbnail extraction failed:', thumbErr)
                  conversionError = 'HEIC conversion failed completely. Please export as JPEG from Photos app and try again.'
                  previewBlob = file // Fallback to original file
                }
              }
            }

            // Set error message if conversion had issues
            if (conversionError) {
              setImageError(conversionError)
            } else {
              setImageError(null)
            }

          } else {
            previewBlob = file
          }

      if (previewBlob) {
        const url = URL.createObjectURL(previewBlob)
        setObjectUrl(url)
        
        // If this was a successful HEIC conversion, offer to save the JPEG
        if (isHeic && previewBlob !== file) {
          setImageError(null)
          console.log('Setting up download for converted HEIC file:', fileName)

          // Store the blob globally for download (prevents garbage collection)
          console.log('💾 STORING CONVERTED BLOB FOR DOWNLOAD:')
          console.log('   Size:', previewBlob?.size, 'bytes')
          console.log('   Type:', previewBlob?.type)
          console.log('   Constructor:', previewBlob?.constructor?.name)
          console.log('   Is Blob:', previewBlob instanceof Blob)
          console.log('   Original filename:', fileName)

          // Create custom folder structure in filename
          const baseName = fileName?.replace(/\.(heic|heif)$/i, '') || 'converted'
          const customFolder = 'photos/converted-heic'
          const customFileName = `${customFolder}/${baseName}.jpg`

          ;(window as any).__currentConvertedBlob = previewBlob
          ;(window as any).__convertedFileName = customFileName
          ;(window as any).__baseFileName = baseName

          console.log('✅ Blob stored globally as __currentConvertedBlob')
          console.log('✅ Filename stored as:', (window as any).__convertedFileName)
          console.log('✅ Download function should now be available')

          // Create the download function
          ;(window as any).__saveConvertedImage = () => {
            const blob = (window as any).__currentConvertedBlob
            const filename = (window as any).__convertedFileName

            console.log('🖱️ SAVE BUTTON CLICKED - STARTING DOWNLOAD')
            console.log('📁 File to save:', filename)
            console.log('📊 Blob size:', blob?.size, 'Type:', blob?.type)

            if (blob && filename) {
              try {
                console.log('✅ Starting download process...')

                // Show immediate feedback
                console.log(`💾 DOWNLOADING FILE: ${filename}`)
                console.log('📁 TARGET FOLDER: photos/converted-heic/')
                console.log('🎯 FINAL LOCATION: Downloads/photos/converted-heic/')
                console.log('')
                console.log('🔍 AFTER DOWNLOAD:')
                console.log('   1. Go to your Downloads folder')
                console.log('   2. Create folder: "photos"')
                console.log('   3. Create subfolder: "converted-heic"')
                console.log('   4. Move the downloaded file there')
                console.log('💡 Quick access: Ctrl+J → right-click file → "Show in folder"')

                const downloadUrl = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = downloadUrl
                link.download = filename
                link.style.display = 'none'

                console.log('🔗 Download link created, triggering click...')
                document.body.appendChild(link)
                link.click()

                // Verify the click worked
                console.log('✅ Click event fired - download initiated')
                console.log(`📋 FILENAME: ${filename}`)
                console.log('🎯 QUICK ACCESS:')
                console.log('   • Press Ctrl+J (Windows/Linux) or Cmd+J (Mac)')
                console.log('   • Check browser download icon/bar')
                console.log('   • File will be in: Downloads folder')
                console.log('   • Move to: Downloads/photos/converted-heic/')
                console.log('💡 The file should appear in your browser\'s download list')

                // Clean up after a delay
                setTimeout(() => {
                  document.body.removeChild(link)
                  URL.revokeObjectURL(downloadUrl)
                  console.log('🧹 Download resources cleaned up')
                  console.log(`✅ DOWNLOAD COMPLETED: ${filename}`)
                  console.log('🎉 File is in your Downloads folder!')
                  console.log('📁 TO ORGANIZE:')
                  console.log('   1. Open Downloads folder')
                  console.log('   2. Create: photos/converted-heic/')
                  console.log('   3. Move file there')
                  console.log('💡 Final location: Downloads/photos/converted-heic/')
                }, 2000)

                } catch (error) {
                const err = error as any
                console.error('❌ DOWNLOAD ERROR:', err)
                console.error('Error details:', err?.message)
                alert(`❌ Download failed: ${err?.message || 'Unknown error'}`)
              }
            } else {
              console.error('❌ CANNOT SAVE: No converted image available')
              console.log('Blob exists:', !!blob)
              console.log('Filename exists:', !!filename)
              if (!blob) console.log('💡 Try reloading the HEIC file to regenerate the converted blob')
              if (!filename) console.log('💡 Filename should be available after successful conversion')
              alert('❌ No converted image available for download. Please reload the file.')
            }
          }

          console.log('✅ Download function created successfully')
          console.log('💡 Manual testing commands:')
          console.log('   window.__saveConvertedImage()  // Trigger download')
          console.log('   window.__currentConvertedBlob  // Check blob exists')
          console.log('   window.__convertedFileName     // Check filename')
          console.log('   window.__baseFileName          // Check base name')
          console.log('')
          console.log('💡 File will be saved as:')
          console.log('   photos/converted-heic/[filename].jpg')
          console.log('')
          console.log('💡 To organize after download:')
          console.log('   1. Open Downloads folder')
          console.log('   2. Create: photos/converted-heic/')
          console.log('   3. Move downloaded file there')
        }
          } else {
            // Try to display HEIC directly in browsers that support it
            try {
              const directUrl = URL.createObjectURL(file)
              setObjectUrl(directUrl)
              setImageError(`HEIC conversion failed: ${conversionError}. Attempting to display original HEIC file. If the image doesn't appear, the EXIF thumbnail will be used as fallback.`)
            } catch (directErr) {
              setObjectUrl(null)
              setImageError(`HEIC conversion failed: ${conversionError}. This file may be HDR/10-bit, corrupted, or use an unsupported HEIC variant. Try: 1) Export as JPEG from Photos app, 2) Set iOS Camera → Formats → Most Compatible, or 3) Use the batch converter (heic-converter.js)`)
            }
          }
    } catch (convErr: any) {
      setObjectUrl(null)
      setImageError(`Unexpected error during image processing: ${convErr?.message || 'Unknown error'}. File may be corrupted or in an unsupported format.`)
    }
    try {
      const arrayBuffer = await file.arrayBuffer()
      const tags = await ExifReader.load(arrayBuffer)
      setRawTags(tags as unknown as MetadataMap)
      const coords = parseGpsFromExif(tags as any)
      setGps(coords)

    } catch (err: any) {
      setRawTags(null)
      setFileError(err?.message ?? 'Failed to read metadata')
      setGps(null)
    }

    // Trigger dynamic welcome generation using preview and EXIF summary for single-file flow
    try {
      const summarized = buildExifSummary(rawTags as any, gps)

      const src = editedObjectUrl || objectUrl
      const previewBase64 = await generatePreviewBase64(src)

      const welcomeEndpoint = (import.meta as any)?.env?.VITE_WELCOME_URL ?? 'http://localhost:3001/api/welcome'
      const resp = await fetch(welcomeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePreview: previewBase64, exifSummary: summarized }),
      })
      console.log('[ui] welcome request (single-file)', { hasPreview: !!previewBase64, previewLen: previewBase64?.length || 0, hasExif: !!summarized })
      const data = await resp.json()
      console.log('[ui] welcome response (single-file)', { status: resp.status, hasKeywords: Array.isArray(data?.keywords), hasDescription: !!data?.detailedDescription, descriptionSource: data?.descriptionSource, hasAnalysis: !!data?.analysis })
      if (resp.ok && typeof data?.welcomeMessage === 'string' && data.welcomeMessage.trim()) {
        const descText = typeof data?.detailedDescription === 'string' && data.detailedDescription.trim().length > 0 ? data.detailedDescription.trim() : null
        const firstMessage = descText ?? data.welcomeMessage.trim()
        setChatMessages([{ role: 'assistant', content: firstMessage }])
        if (!descText || data?.descriptionSource === 'fallback') {
          setChatMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Note: Using metadata/tags for the initial greeting; visual description was unavailable.' },
          ])
        }
        if (Array.isArray(data?.keywords)) setKeywords(data.keywords)
        if (typeof data?.detailedDescription === 'string') setDetailedDescription(data.detailedDescription)
        if (data?.descriptionSource === 'model' || data?.descriptionSource === 'fallback') setDescriptionSource(data.descriptionSource)
        // (Diagnostics removed from chat to avoid confusing messaging)
      } else if (resp.status === 503 && (data?.errorCode === 'LLM_API_KEY_MISSING' || data?.errorCode === 'LLM_AUTH_FAILED')) {
        setChatMessages([{ role: 'assistant', content: 'No LLM API key found or authentication failed. Add OPENAI_API_KEY in .env and reload, then try again.' }])
      }
    } catch {
      // Non-fatal; keep standby or default
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Photo Metadata Viewer & Batch Converter</h1>
        <p>Upload individual photos or entire folders. Convert HEIC files to browser-compatible JPEG format while preserving all metadata.</p>

        <div className="mode-selector">
          <button
            className={`mode-btn ${!showBatchConverter && !showFolderSelector ? 'active' : ''}`}
            onClick={() => {
              setShowFolderSelector(false)
              setShowBatchConverter(false)
            }}
          >
            Individual Photo Viewer
          </button>
          <button
            className={`mode-btn ${showFolderSelector ? 'active' : ''}`}
            onClick={() => {
              setShowFolderSelector(true)
              setShowBatchConverter(false)
            }}
          >
            HEIC Folder Processor
          </button>
          <button
            className={`mode-btn ${showBatchConverter ? 'active' : ''}`}
            onClick={() => {
              setShowBatchConverter(true)
              setShowFolderSelector(false)
            }}
          >
            Batch Image Converter
          </button>
        </div>
      </header>

      {showBatchConverter ? (
        <div className="upload-container">
          <BatchConverter onConversionComplete={handleBatchConversionComplete} />
        </div>
      ) : !showFolderSelector ? (
        <div className="upload-container">
          <FolderUpload onFolderProcessed={handleFolderProcessed} />

          <section className="uploader single-file">
            <h3>Single File Upload</h3>
            <label className="fileLabel">
              <input type="file" accept="image/*,.heic,.heif" onChange={handleFileChange} />
              <span className="fileButton">Choose Single Image</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferLibheif}
                onChange={(ev) => setPreferLibheif(ev.target.checked)}
              />
              {' '}Prefer libheif decoder
            </label>
            {fileName && (
              <div className="fileInfo">
                <span title={fileName}>{fileName}</span>
                {fileSize != null && <span> · {(fileSize / 1024).toFixed(1)} KB</span>}
              </div>
            )}
            {fileError && <div className="error">{fileError}</div>}
          </section>
        </div>
      ) : (
        <div className="folder-selector">
          <div className="folder-header">
            <h3>📁 {currentFolder}</h3>
            <p>Select a photo to view its details:</p>
            <button
              className="back-button"
              onClick={() => {
                setShowFolderSelector(false)
                setCurrentFolder(null)
                setProcessedFiles([])
                setSelectedPhoto(null)
              }}
            >
              ← Back to Upload
            </button>
          </div>
          <div className="photo-grid">
            {processedFiles.map((photo, index) => (
              <div
                key={index}
                className={`photo-item ${selectedPhoto === photo ? 'selected' : ''}`}
                onClick={() => handlePhotoSelect(photo)}
              >
                <div className="photo-preview">
                  {photo.previewUrl && photo.status === 'completed' ? (
                    <img src={photo.previewUrl} alt={photo.originalFile.name} />
                  ) : (
                    <div className="preview-placeholder">
                      {photo.status === 'processing' ? '⏳' : '❌'}
                    </div>
                  )}
                </div>
                <div className="photo-info">
                  <div className="photo-name">{photo.originalFile.name}</div>
                  <div className="photo-status">
                    {photo.status === 'completed'
                      ? ((photo.originalFile.name.match(/\.(heic|heif)$/i) || photo.originalFile.type === 'image/heic' || photo.originalFile.type === 'image/heif') ? '✅ Converted' : '✅ Compatible')
                      : '❌ Failed'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="content">
        <div className="preview">
          {imageError && <div className="error">{imageError}</div>}
          
          {/* Thumbnail and metadata info */}
          <div className="image-info">
            {objectUrl && (
              <div className="thumbnail-container">
                <img
                  src={objectUrl}
                  alt="Thumbnail"
                  className="thumbnail"
                  onError={(e) => {
                    if (fileName?.match(/\.(heic|heif)$/i)) {
                      setImageError(`HEIC thumbnail failed to load, but main image should still work. The file is not corrupted.`)
                    } else {
                      setImageError(`Failed to load image: ${objectUrl}. The file may be corrupted or in an unsupported format.`)
                    }
                    setObjectUrl(null)
                  }}
                  onLoad={() => {
                    setImageError(null)
                  }}
                />
              </div>
            )}
            
            {/* Photo metadata summary */}
              {rawTags && (
              <div className="photo-summary">
                <h3>Photo Information</h3>
                <div className="summary-item">
                  <strong>Date/Time:</strong> {(rawTags as any).DateTime?.value || (rawTags as any).DateTimeOriginal?.value || 'Unknown'}
                </div>
                <div className="summary-item">
                  <strong>Device:</strong> {(rawTags as any).Make?.value || ''} {(rawTags as any).Model?.value || ''}
                </div>
                {gps && (
                  <div className="summary-item">
                    <strong>Location:</strong> {gps.lat.toFixed(6)}°N, {gps.lng.toFixed(6)}°W
                  </div>
                )}
                {(rawTags as any).GPSAltitude && (
                  <div className="summary-item">
                    <strong>Altitude:</strong> {(rawTags as any).GPSAltitude.value} {(rawTags as any).GPSAltitudeRef?.value === 'Below sea level' ? 'below sea level' : 'above sea level'}
                  </div>
                )}
                
            {/* Metadata controls moved up */}
            <div className="metadata-controls">
              <button className="control-btn" onClick={() => setShowMeta(v => !v)}>
                {showMeta ? 'Hide metadata' : 'Show metadata'}
              </button>
              <button
                className="control-btn"
                disabled={!rawTags}
                onClick={() => rawTags && copyToClipboard(JSON.stringify(rawTags, null, 2))}
                title={!rawTags ? 'Load a file first' : 'Copy all metadata JSON'}
              >
                Copy metadata
              </button>
              <button
                className="control-btn"
                disabled={!gps}
                onClick={() => gps && copyToClipboard(`${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`)}
                title={!gps ? 'No GPS found' : 'Copy GPS as "lat, lng"'}
              >
                Copy GPS
              </button>
              {fileName?.match(/\.(heic|heif)$/i) && objectUrl && (
                <>
                  <button
                    className="control-btn"
                    onClick={() => {
                      console.log('🖱️ === SAVE AS JPEG BUTTON CLICKED ===')
                      console.log('📁 File to save:', (window as any).__convertedFileName)
                      console.log('📊 Blob size:', (window as any).__currentConvertedBlob?.size)

                      if ((window as any).__saveConvertedImage) {
                        console.log('✅ Calling download function...')
                        ;(window as any).__saveConvertedImage()
                      } else {
                        console.error('❌ No download function available')
                        console.log('💡 This happens when:')
                        console.log('   - No HEIC file was successfully converted')
                        console.log('   - The file was not a HEIC/HEIF format')
                        console.log('   - Conversion failed and no blob was created')
                        alert('Download function not available. Please reload the file.')
                      }
                    }}
                    title="Download converted JPEG with metadata preserved"
                  >
                    Save as JPEG
                  </button>

                  {/* Debug button for testing */}
                  <button
                    className="control-btn debug-btn"
                    onClick={() => {
                      console.log('🔍 DEBUG: Manual download test')
                      console.log('Current blob:', (window as any).__currentConvertedBlob)
                      console.log('Current filename:', (window as any).__convertedFileName)
                      console.log('Download function:', !!(window as any).__saveConvertedImage)

                      if ((window as any).__saveConvertedImage) {
                        ;(window as any).__saveConvertedImage()
                      }
                    }}
                    title="Debug: Test download function manually"
                    style={{ marginLeft: '5px', fontSize: '10px', padding: '2px 6px' }}
                  >
                    🐛 Test
                  </button>

                  {/* Open downloads folder button */}
                  <button
                    className="control-btn debug-btn"
                    onClick={() => {
                      const filename = (window as any).__convertedFileName || 'converted-file.jpg'
                      console.log('📁 DOWNLOAD ORGANIZATION:')
                      console.log('1. File downloads to: Downloads folder')
                      console.log('2. Create folder structure: photos/converted-heic/')
                      console.log('3. Move file to: Downloads/photos/converted-heic/')
                      console.log('4. Final path will be:', filename)
                      console.log('')
                      console.log('💡 Quick setup:')
                      console.log('   • Open Downloads folder')
                      console.log('   • Create new folder: "photos"')
                      console.log('   • Inside "photos", create: "converted-heic"')
                      console.log('   • Move downloaded files there')

                      alert('📁 FILE ORGANIZATION:\\n\\n1. Downloads to: Downloads folder\\n2. Create: photos/converted-heic/\\n3. Move file there\\n4. Final: Downloads/photos/converted-heic/\\n\\n💡 Use Ctrl+J to see downloads, then organize!')
                    }}
                    title="Show download locations"
                    style={{ marginLeft: '3px', fontSize: '10px', padding: '2px 6px' }}
                  >
                    📁 Where?
                  </button>
                </>
              )}
              {fileName?.match(/\.(heic|heif)$/i) && imageError && imageError.includes('HEIC conversion failed') && (
                <button
                  className="control-btn"
                  onClick={() => window.open('heic-converter.js', '_blank')}
                  title="Open batch converter for HEIC files"
                >
                  Batch Converter
                </button>
              )}
            </div>
              </div>
            )}
          </div>

          {/* Dual maps */}
          {gps && (
            <div className="maps-container">
              <div className="map-section">
                <h3>Detailed Location</h3>
                <div className={`map ${isLargeMap ? 'map--large' : 'map--small'}`}>
                  <div className="mapToolbar">
                    <button className="mapToggle" onClick={() => setIsLargeMap(v => !v)}>
                      {isLargeMap ? 'Smaller map' : 'Larger map'}
                    </button>
                    <button className="mapToggle" onClick={() => setFullscreen(true)}>Open fullscreen</button>
                  </div>
                  <MapView
                    lat={gps.lat}
                    lng={gps.lng}
                    label={fileName ?? undefined}
                    isLarge={isLargeMap}
                    zoomLevel={18}
                    minZoom={17}
                    maxZoom={22}
                  />
                </div>
              </div>
              
              <div className="map-section">
                <h3>Regional View (100 mile area)</h3>
                <div className="map map--regional">
                  <MapView
                    lat={gps.lat}
                    lng={gps.lng}
                    label={fileName ?? undefined}
                    isLarge={false}
                    centerOverride={[44.4, -110.8]}
                    boundsOverride={[
                      [43.55, -111.25], // Southwest near Grand Teton boundary
                      [45.08, -109.9],   // Northeast near Yellowstone boundary
                    ]}
                    recenterKey="yellowstone"
                  />
                </div>
              </div>
            </div>
          )}
          
          {!gps && objectUrl && (
            <div className="empty">No GPS found in this file.</div>
          )}
        </div>
        
        <div className="workspace">
          <div className="meta">
            <div className="dual-preview">
            <div className="preview-pane">
              <div className="preview-header">
                <h3>Original Photo</h3>
                {fileName && <span className="preview-filename" title={fileName}>{fileName}</span>}
              </div>
              {objectUrl ? (
                <img
                  src={objectUrl}
                  alt="Selected"
                  className="main-image"
                  onError={(e) => {
                    const isHeicFile = fileName?.match(/\.(heic|heif)$/i)
                    if (isHeicFile) {
                      console.error('Failed to display converted JPEG for HEIC file:', objectUrl)
                      setImageError(`HEIC file conversion may have failed. The converted JPEG could not be displayed. This is a browser limitation - the file is not corrupted. All GPS and metadata functionality is fully available. For image display, use the batch converter or export as JPEG from Photos app.`)
                    } else {
                      setImageError(`Failed to load image: ${objectUrl}. The file may be corrupted or in an unsupported format.`)
                    }
                    setObjectUrl(null)
                  }}
                  onLoad={() => {
                    setImageError(null)
                  }}
                />
              ) : fileName?.match(/\.(heic|heif)$/i) ? (
                <div className="placeholder">HEIC preview unavailable</div>
              ) : (
                <div className="placeholder">No original image available</div>
              )}
            </div>

            <div className="preview-pane">
              <div className="preview-header">
                <div className="preview-header-left">
                  <h3>Edited Preview</h3>
                  {editedFileName && <span className="preview-filename" title={editedFileName}>{editedFileName}</span>}
                </div>
                <div className="preview-actions">
                  <button
                    className="control-btn"
                    disabled={!editedBlobState}
                    onClick={() => {
                      const filename = editedFileName || (window as any).__convertedFileName || 'edited.jpg'
                      const imgSrc = editedObjectUrl || objectUrl
                      if (!imgSrc) { alert('No image to save.'); return }
                      const img = new Image()
                      img.crossOrigin = 'anonymous'
                      img.onload = () => {
                        const canvas = document.createElement('canvas')
                        canvas.width = img.naturalWidth
                        canvas.height = img.naturalHeight
                        const ctx = canvas.getContext('2d')
                        if (!ctx) { alert('Canvas not supported.'); return }
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                        // Render all captions into saved image
                        captions.forEach(c => {
                          if (!c.text) return
                          const x = c.x * canvas.width
                          const y = c.y * canvas.height
                          const fontPx = Math.max(10, Math.round((c.sizePct / 100) * Math.max(canvas.width, canvas.height)))
                          ctx.font = `${c.weight || 700} ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial`
                          ctx.fillStyle = c.color || '#FFD400'
                          ctx.textAlign = 'center'
                          ctx.textBaseline = 'middle'
                          if (c.stroke) {
                            ctx.strokeStyle = c.stroke
                            ctx.lineWidth = Math.max(1, Math.round(fontPx * 0.08))
                            ctx.strokeText(c.text, x, y)
                          }
                          ctx.fillText(c.text, x, y)
                        })
                        canvas.toBlob(b => {
                          if (!b) { alert('Failed to create image.'); return }
                          const url = URL.createObjectURL(b)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = filename
                          document.body.appendChild(a)
                          a.click()
                          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
                        }, 'image/jpeg', 0.95)
                      }
                      img.onerror = () => alert('Failed to load image for saving.')
                      img.src = imgSrc
                    }}
                    title="Save edited image"
                  >
                    Save Edited
                  </button>
                </div>
              </div>
              {editedObjectUrl ? (
                <div className="edited-stage">
                  <img
                    src={editedObjectUrl}
                    alt="Edited preview"
                    className="main-image"
                    onError={() => {
                      setEditedObjectUrl(null)
                    }}
                  />
                  {captions.map(c => (
                    c.text ? (
                      <div
                        key={c.id}
                        className="caption-overlay"
                        style={{
                          left: `${c.x * 100}%`,
                          top: `${c.y * 100}%`,
                          fontSize: `${c.sizePct}vmin`,
                          color: c.color,
                          fontWeight: c.weight || 700,
                          WebkitTextStroke: c.stroke ? `1px ${c.stroke}` : undefined,
                          maxWidth: '95%',
                          wordWrap: 'break-word',
                          lineHeight: 1.1,
                          whiteSpace: 'nowrap',
                          transform: (() => {
                            const a = c.anchor || 'bc'
                            const map: Record<string, string> = {
                              tl: 'translate(0%, 0%)', tc: 'translate(-50%, 0%)', tr: 'translate(-100%, 0%)',
                              cl: 'translate(0%, -50%)', cc: 'translate(-50%, -50%)', cr: 'translate(-100%, -50%)',
                              bl: 'translate(0%, -100%)', bc: 'translate(-50%, -100%)', br: 'translate(-100%, -100%)',
                            }
                            return map[a] || 'translate(-50%, -100%)'
                          })(),
                        }}
                        onPointerDown={onCaptionPointerDown}
                        onPointerMove={onCaptionPointerMove}
                        onPointerUp={onCaptionPointerUp}
                      >
                        {c.text}
                      </div>
                    ) : null
                  ))}
                </div>
              ) : (
                <div className="placeholder">Edited version will appear here</div>
              )}
            </div>
          </div>

            {showMeta ? (
              parsed.length === 0 ? (
                <div className="empty">No metadata found yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map(tag => (
                      <tr key={tag.key}>
                        <td>
                          <div className="tagKey">{tag.key}</div>
                          {tag.label && tag.label !== tag.key && (
                            <div className="tagLabel">{tag.label}</div>
                          )}
                        </td>
                        <td>
                          <pre className="tagValue">{tag.value}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="empty">Metadata hidden. Use the buttons above to view or copy.</div>
            )}
            {keywords.length > 0 && (
              <div className="keywords" style={{ marginTop: '8px' }}>
                <strong>Keywords:</strong> {keywords.join(', ')}{' '}
                <button
                  className="control-btn"
                  onClick={() => copyToClipboard(keywords.join(', '))}
                  title="Copy keywords"
                  style={{ marginLeft: '6px' }}
                >
                  Copy keywords
                </button>
              </div>
            )}
            {detailedDescription && (
              <div className="description" style={{ marginTop: '8px' }}>
                <strong>Description{descriptionSource ? ` (${descriptionSource === 'fallback' ? 'synthesized' : 'model'})` : ''}:</strong>{' '}
                {detailedDescription}
                <button
                  className="control-btn"
                  onClick={() => copyToClipboard(detailedDescription!)}
                  title="Copy description"
                  style={{ marginLeft: '6px' }}
                >
                  Copy description
                </button>
              </div>
            )}
          </div>

          <aside className="chat-panel">
            <h3>Chat with Photo Assistant</h3>
            <div className="chat-thread">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message chat-message--${msg.role}`}>
                  <strong>{msg.role === 'assistant' ? 'Assistant' : 'You'}:</strong>
                  <p>{msg.content}</p>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-message chat-message--assistant">
                  <strong>Assistant:</strong>
                  <p>{'Thinking…'}</p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {chatError && <div className="error" style={{ marginTop: '8px' }}>{chatError}</div>}
            <form className="chat-form" onSubmit={handleChatSubmit}>
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Describe an edit or ask a question"
                disabled={chatLoading}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>
                {chatLoading ? 'Sending…' : 'Send'}
              </button>
            </form>
          </aside>
        </div>
      </main>

      <footer className="footer">
        <small>All processing happens in your browser. No uploads.</small>
      </footer>
      {fullscreen && gps && (
        <div className="mapModal" role="dialog" aria-modal="true">
          <div className="mapModalInner">
            <div className="mapModalToolbar">
              <button className="mapToggle" onClick={() => setFullscreen(false)}>Close</button>
            </div>
            <div className="map map--modal">
              <MapView lat={gps.lat} lng={gps.lng} label={fileName ?? undefined} resizeKey={fullscreen} zoomLevel={16} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


