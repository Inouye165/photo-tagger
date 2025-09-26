export type ExifTags = Record<string, any>

function toNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
    // Try DMS string: 44 deg 30' 15.12" or 44°30'15.12"
    const dms = value.match(/(-?\d+(?:\.\d+)?)\s*(?:°|deg)\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*"?/i)
    if (dms) {
      const d = Number(dms[1])
      const m = dms[2] ? Number(dms[2]) : 0
      const s = dms[3] ? Number(dms[3]) : 0
      if ([d, m, s].every(Number.isFinite)) return Math.abs(d) + m / 60 + s / 3600
    }
    // Try comma-separated D,M,S
    const parts = value.split(',').map(p => Number(p.trim()))
    if (parts.length >= 2 && parts.every(n => Number.isFinite(n))) {
      const [d, m = 0, s = 0] = parts
      return Math.abs(d) + m / 60 + s / 3600
    }
    return null
  }
  if (Array.isArray(value)) {
    // Rationals or numbers
    const nums = value.map(v => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') return Number(v)
      if (v && typeof v === 'object' && 'numerator' in v && 'denominator' in v) {
        const num = Number((v as any).numerator)
        const den = Number((v as any).denominator)
        if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den
      }
      return NaN
    })
    if (nums.every(n => Number.isFinite(n))) {
      if (nums.length >= 3) return Math.abs(nums[0]) + nums[1] / 60 + nums[2] / 3600
      if (nums.length >= 1) return nums[0]
    }
  }
  return null
}

function applyHemisphere(value: number | null, ref: unknown): number | null {
  if (value == null) return null
  const refStr = typeof ref === 'string' ? ref : Array.isArray(ref) && ref.length ? String(ref[0]) : undefined
  if (!refStr) return value
  const r = refStr.toUpperCase()
  if (r.startsWith('S') || r.startsWith('W')) return -Math.abs(value)
  return Math.abs(value)
}

export function parseGpsFromExif(tags: ExifTags): { lat: number; lng: number } | null {
  const latTag = tags?.GPSLatitude
  const lngTag = tags?.GPSLongitude
  const latRef = tags?.GPSLatitudeRef?.value ?? tags?.GPSLatitudeRef?.description
  const lngRef = tags?.GPSLongitudeRef?.value ?? tags?.GPSLongitudeRef?.description

  let lat = toNumber(latTag?.value)
  let lng = toNumber(lngTag?.value)

  // Fallback to description if needed
  if (lat == null) lat = toNumber(latTag?.description)
  if (lng == null) lng = toNumber(lngTag?.description)

  lat = applyHemisphere(lat, latRef)
  lng = applyHemisphere(lng, lngRef)

  if (lat == null || lng == null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}





