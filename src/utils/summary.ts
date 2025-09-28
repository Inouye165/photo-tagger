export type GpsPoint = { lat: number; lng: number }

export type ExifSummary = {
  DateTime?: string | null
  Make?: string | null
  Model?: string | null
  LensModel?: string | null
  GPS?: GpsPoint | null
  Orientation?: unknown
} | null

function safeTagString(tags: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!tags) return null
  const t: any = (tags as any)[key]
  const val = t?.description ?? t?.value ?? t
  if (val == null) return null
  if (Array.isArray(val)) return val.map(v => String(v)).join(' ')
  return String(val)
}

export function buildExifSummary(tags: Record<string, unknown> | null | undefined, gps: GpsPoint | null | undefined): ExifSummary {
  if (!tags && !gps) return null
  return {
    DateTime: safeTagString(tags, 'DateTime') || safeTagString(tags, 'DateTimeOriginal'),
    Make: safeTagString(tags, 'Make'),
    Model: safeTagString(tags, 'Model'),
    LensModel: safeTagString(tags, 'LensModel'),
    GPS: gps ?? null,
    Orientation: safeTagString(tags, 'Orientation'),
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for preview.'))
    img.src = src
  })
}

export async function generatePreviewBase64(src: string | null | undefined, maxSide = 768): Promise<string | null> {
  try {
    if (!src) return null
    const img = await loadImageElement(src)
    const scale = Math.min(maxSide / Math.max(img.width, img.height), 1)
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}


