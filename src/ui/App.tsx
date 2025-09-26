import { useMemo, useState } from 'react'
import ExifReader from 'exifreader'
import heic2any from 'heic2any'
import { MapView } from './MapView'
import { parseGpsFromExif } from '../utils/gps'
import { convertHeicToJpegBlob } from '../utils/heic'

type MetadataMap = Record<string, unknown>

type ParsedTag = {
  key: string
  label: string
  value: string
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

export function App() {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [rawTags, setRawTags] = useState<MetadataMap | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [isLargeMap, setIsLargeMap] = useState<boolean>(false)
  const [fullscreen, setFullscreen] = useState<boolean>(false)
  const [showMeta, setShowMeta] = useState<boolean>(false)
  const [preferLibheif, setPreferLibheif] = useState<boolean>(false)

  const parsed = useMemo(() => rawTags ? parseTags(rawTags) : [], [rawTags])

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
    setFileError(null)
    setImageError(null)
    setFileName(file.name)
    setFileSize(file.size)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    // Prepare preview: Convert HEIC/HEIF to JPEG for browsers that can't display HEIC
    const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
    try {
      let previewBlob: Blob | null = null
      if (isHeic) {
        if (preferLibheif) {
          try {
            previewBlob = await convertHeicToJpegBlob(file, 0.92)
          } catch {
            try {
              const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob | Blob[]
              previewBlob = Array.isArray(converted) ? converted[0] : converted
            } catch (e: any) {
              previewBlob = null
            }
          }
        } else {
          try {
            const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob | Blob[]
            previewBlob = Array.isArray(converted) ? converted[0] : converted
          } catch {
            try {
              previewBlob = await convertHeicToJpegBlob(file, 0.92)
            } catch (e: any) {
              previewBlob = null
            }
          }
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
          // Add download link for the converted JPEG
          const downloadUrl = URL.createObjectURL(previewBlob)
          const link = document.createElement('a')
          link.href = downloadUrl
          link.download = fileName?.replace(/\.(heic|heif)$/i, '.jpg') || 'converted.jpg'
          link.style.display = 'none'
          document.body.appendChild(link)
          // Store the download function for the save button
          ;(window as any).__saveConvertedImage = () => {
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(downloadUrl)
          }
        }
      } else {
        setObjectUrl(null)
        setImageError('Could not decode HEIC for preview. This file may be HDR/10-bit or unsupported. Try exporting as JPEG or set iOS Camera → Formats → Most Compatible.')
      }
    } catch (convErr: any) {
      setObjectUrl(null)
      setImageError(convErr?.message ?? 'Failed to convert image for preview')
    }
    try {
      const arrayBuffer = await file.arrayBuffer()
      const tags = await ExifReader.load(arrayBuffer)
      setRawTags(tags as unknown as MetadataMap)
      const coords = parseGpsFromExif(tags as any)
      setGps(coords)

      // Fallback: if HEIC couldn't be decoded for preview, try embedded JPEG thumbnail from EXIF
      if (!objectUrl && isHeic) {
        const anyTags: any = tags as any
        const tn = anyTags?.thumbnail ?? anyTags?.Thumbnail ?? anyTags?.JPEGThumbnail ?? anyTags?.PreviewImage
        const tnVal = tn?.value ?? tn?.data ?? tn
        let thumbBlob: Blob | null = null
        if (tnVal) {
          if (tnVal instanceof Blob) {
            thumbBlob = tnVal
          } else if (tnVal instanceof ArrayBuffer) {
            thumbBlob = new Blob([tnVal], { type: 'image/jpeg' })
          } else if (ArrayBuffer.isView(tnVal) && tnVal.buffer) {
            thumbBlob = new Blob([tnVal.buffer], { type: 'image/jpeg' })
          }
        }
        if (thumbBlob) {
          const url = URL.createObjectURL(thumbBlob)
          setObjectUrl(url)
          setImageError(null)
        }
      }
    } catch (err: any) {
      setRawTags(null)
      setFileError(err?.message ?? 'Failed to read metadata')
      setGps(null)
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Photo Metadata Viewer</h1>
        <p>Load a photo to preview it and inspect all metadata (EXIF, IPTC, XMP).</p>
      </header>

      <section className="uploader">
        <label className="fileLabel">
          <input type="file" accept="image/*,.heic,.heif" onChange={handleFileChange} />
          <span className="fileButton">Choose Image</span>
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

      <main className="content">
        <div className="preview">
          {imageError && <div className="error">{imageError}</div>}
          {objectUrl ? (
            <img src={objectUrl} alt="Selected" />
          ) : (
            <div className="placeholder">No image selected</div>
          )}
          {gps && (
            <div className={`map ${isLargeMap ? 'map--large' : 'map--small'}`}>
              <div className="mapToolbar">
                <button className="mapToggle" onClick={() => setIsLargeMap(v => !v)}>
                  {isLargeMap ? 'Smaller map' : 'Larger map'}
                </button>
                <button className="mapToggle" onClick={() => setFullscreen(true)}>Open fullscreen</button>
              </div>
              <MapView lat={gps.lat} lng={gps.lng} label={fileName ?? undefined} isLarge={isLargeMap} />
            </div>
          )}
          {!gps && objectUrl && (
            <div className="empty">No GPS found in this file.</div>
          )}
        </div>
        <div className="meta">
          <div className="metaToolbar">
            <button className="mapToggle" onClick={() => setShowMeta(v => !v)}>
              {showMeta ? 'Hide metadata' : 'Show metadata'}
            </button>
            <button
              className="mapToggle"
              disabled={!rawTags}
              onClick={() => rawTags && copyToClipboard(JSON.stringify(rawTags, null, 2))}
              title={!rawTags ? 'Load a file first' : 'Copy all metadata JSON'}
            >
              Copy metadata
            </button>
            <button
              className="mapToggle"
              disabled={!gps}
              onClick={() => gps && copyToClipboard(`${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`)}
              title={!gps ? 'No GPS found' : 'Copy GPS as "lat, lng"'}
            >
              Copy GPS
            </button>
            {fileName?.match(/\.(heic|heif)$/i) && objectUrl && (
              <button
                className="mapToggle"
                onClick={() => (window as any).__saveConvertedImage?.()}
                title="Download converted JPEG with metadata preserved"
              >
                Save as JPEG
              </button>
            )}
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
              <MapView lat={gps.lat} lng={gps.lng} label={fileName ?? undefined} resizeKey={fullscreen} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


