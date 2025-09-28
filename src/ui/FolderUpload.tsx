import { useState, useCallback } from 'react'
import { generateEditedMetadata } from '../utils/edited'

interface ProcessedFile {
  originalFile: File
  convertedBlob?: Blob
  metadata?: any
  previewUrl?: string
  editedFileName?: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
}

interface FolderUploadProps {
  onFolderProcessed: (folderName: string, files: ProcessedFile[]) => void
}

export function FolderUpload({ onFolderProcessed }: FolderUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([])

  const processFiles = useCallback(async (files: File[], customFolderName?: string) => {
    setIsProcessing(true)
    setProcessedFiles([])

    const folderName = customFolderName || `converted-${Date.now()}`
    const processed: ProcessedFile[] = []

    // Continue with conversion - we'll handle HEIC conversion failures gracefully

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`)

      const processedFile: ProcessedFile = {
        originalFile: file,
        status: 'pending'
      }

      processed.push(processedFile)
      setProcessedFiles([...processed])

      try {
        processedFile.status = 'processing'

        // Extract metadata first
        const arrayBuffer = await file.arrayBuffer()
        const tags = await import('exifreader').then(m => m.default.load(arrayBuffer))
        processedFile.metadata = tags

        // Check if this is actually a HEIC file that needs conversion
        const isHeicFile = file.name.match(/\.(heic|heif)$/i) || file.type === 'image/heic' || file.type === 'image/heif'
        console.log(`Is HEIC file: ${isHeicFile}, filename: ${file.name}, MIME: ${file.type}`)

        // Handle HEIC files - convert to JPEG for browser compatibility
        if (isHeicFile) {
          console.log('HEIC file detected - converting to JPEG for browser compatibility...')

          try {
            // Try heic2any conversion first with multiple options
            console.log('Attempting heic2any conversion...')
            let converted: Blob | Blob[]

            try {
              // Try with different quality settings
              converted = await import('heic2any').then(m =>
                m.default({
                  blob: file,
                  toType: 'image/jpeg',
                  quality: 0.95
                })
              )
            } catch (err1) {
              console.log('First heic2any attempt failed, trying with lower quality...')
              try {
                converted = await import('heic2any').then(m =>
                  m.default({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.8
                  })
                )
              } catch (err2) {
                console.log('Second heic2any attempt failed, trying PNG...')
                converted = await import('heic2any').then(m =>
                  m.default({
                    blob: file,
                    toType: 'image/png',
                    quality: 0.8
                  })
                )
              }
            }

            const jpegBlob = Array.isArray(converted) ? converted[0] : converted

            // Verify the conversion actually worked
            if (jpegBlob && jpegBlob.size > 0) {
              // Store both the converted JPEG and create preview URL
              processedFile.convertedBlob = jpegBlob
              processedFile.status = 'completed'
              processedFile.previewUrl = URL.createObjectURL(jpegBlob)
              console.log('HEIC converted to JPEG successfully, size:', jpegBlob.size, 'type:', jpegBlob.type)
            } else {
              throw new Error('Conversion produced empty or invalid blob')
            }

          } catch (heic2anyErr) {
            console.warn('heic2any failed:', heic2anyErr)

            try {
              // Try libheif as fallback
              console.log('Attempting libheif conversion...')
              const jpegBlob = await import('../utils/heic').then(m => m.convertHeicToJpegBlob(file, 0.95))
              console.log('libheif conversion successful, blob size:', jpegBlob.size, 'type:', jpegBlob.type)

              // Verify the conversion actually worked
              if (jpegBlob && jpegBlob.size > 0) {
                processedFile.convertedBlob = jpegBlob
                processedFile.status = 'completed'
                processedFile.previewUrl = URL.createObjectURL(jpegBlob)
                console.log('HEIC converted via libheif successfully')
              } else {
                throw new Error('libheif conversion produced empty or invalid blob')
              }

            } catch (libheifErr) {
              console.error('libheif conversion failed:', libheifErr)
              console.error('All HEIC conversion methods failed:', libheifErr)

              // Final fallback: try to extract EXIF thumbnail
              try {
                console.log('Trying EXIF thumbnail extraction...')
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
                        thumbBlob = new Blob([tnVal], { type: 'image/jpeg' })
                      } else if (ArrayBuffer.isView(tnVal) && tnVal.buffer) {
                        thumbBlob = new Blob([tnVal.buffer], { type: 'image/jpeg' })
                      } else if (tnVal instanceof Uint8Array) {
                        thumbBlob = new Blob([tnVal], { type: 'image/jpeg' })
                      }

                    if (thumbBlob && thumbBlob.size > 0) {
                      console.log('Found valid EXIF thumbnail, size:', thumbBlob.size, 'type:', thumbBlob.type)
                      processedFile.convertedBlob = thumbBlob
                      processedFile.status = 'completed'
                      processedFile.previewUrl = URL.createObjectURL(thumbBlob)
                      console.log('Using EXIF thumbnail as fallback')
                      break
                    } else {
                      console.log('EXIF thumbnail found but invalid (size:', thumbBlob?.size, ')')
                    }
                    }
                  }
                }

                if (!processedFile.previewUrl) {
                  console.log('No valid EXIF thumbnail found for HEIC file')
                  throw new Error('No EXIF thumbnail found')
                }

              } catch (thumbErr) {
                console.error('EXIF thumbnail extraction failed:', thumbErr)
                processedFile.status = 'error'
                processedFile.error = 'HEIC conversion failed completely. Please export as JPEG from Photos app and try again.'
              }
            }
          }

        } else {
          // For non-HEIC files, use original (already browser-compatible)
          processedFile.convertedBlob = file
          processedFile.status = 'completed'
          processedFile.previewUrl = URL.createObjectURL(file)
        }

        setProcessedFiles([...processed])
      } catch (err: any) {
        processedFile.status = 'error'
        processedFile.error = err.message || 'Processing failed'
        setProcessedFiles([...processed])

        // Continue processing other files, don't stop the entire process
        console.warn(`File ${file.name} failed to process, continuing with other files...`)
      }
    }

    setIsProcessing(false)
    onFolderProcessed(folderName, processed)
  }, [onFolderProcessed])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []

    const processItems = async () => {
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry && entry.isDirectory) {
            // Handle folder
            const folderFiles = await getFilesFromDirectory(entry as any)
            files.push(...folderFiles)
          } else {
            // Handle individual file
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }
      }

      if (files.length > 0) {
        await processFiles(files, folderName || undefined)
      }
    }

    processItems()
  }, [folderName, processFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      await processFiles(files, folderName || undefined)
    }
  }, [folderName, processFiles])

  const getFilesFromDirectory = async (dirEntry: any): Promise<File[]> => {
    const files: File[] = []

    const readEntries = async (entry: any): Promise<void> => {
      return new Promise((resolve) => {
        const reader = entry.createReader()
        reader.readEntries(async (entries: any[]) => {
          for (const entry of entries) {
            if (entry.isFile) {
              await new Promise<void>((resolveFile) => {
                entry.file((file: File) => {
                  // Only process image files
                  if (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i)) {
                    files.push(file)
                  }
                  resolveFile()
                })
              })
            } else if (entry.isDirectory) {
              await readEntries(entry)
            }
          }
          resolve()
        })
      })
    }

    await readEntries(dirEntry)
    return files
  }

  return (
    <div className="folder-upload">
      <div className="upload-section">
        <h2>Batch Photo Converter</h2>
        <p>Upload a folder of photos to convert all HEIC files to browser-compatible JPEG format while preserving all metadata.</p>

        <div className="folder-name-input">
          <label htmlFor="folderName">Folder Name:</label>
          <input
            id="folderName"
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Enter custom folder name (optional)"
          />
        </div>

        <div
          className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isProcessing ? 'processing' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="drop-zone-content">
            <div className="upload-icon">📁</div>
            <h3>Drop Folder Here</h3>
            <p>Or click to select individual files</p>
            <input
              type="file"
              multiple
              webkitdirectory=""
              onChange={handleFileInput}
              style={{ display: 'none' }}
              id="fileInput"
            />
            <label htmlFor="fileInput" className="file-input-label">
              Select Files
            </label>
          </div>
        </div>

        {isProcessing && (
          <div className="processing-status">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(processedFiles.filter(f => f.status === 'completed').length / processedFiles.length) * 100}%` }}
              ></div>
            </div>
            <p>Processing {processedFiles.filter(f => f.status === 'processing').length} of {processedFiles.length} files...</p>
          </div>
        )}

        {processedFiles.length > 0 && (
          <div className="processed-files">
            <h3>Conversion Results</h3>
            <div className="files-grid">
              {processedFiles.map((file, index) => (
                <div key={index} className={`file-item ${file.status}`}>
                  <div className="file-preview">
                    {file.previewUrl ? (
                      <img src={file.previewUrl} alt={file.originalFile.name} />
                    ) : (
                      <div className="preview-placeholder">📷</div>
                    )}
                  </div>
                  <div className="file-info">
                    <div className="file-name">{file.originalFile.name}</div>
                    <div className="file-status">
                      {file.status === 'processing' && '⏳ Processing...'}
                      {file.status === 'completed' && (
                        (file.originalFile.name.match(/\.(heic|heif)$/i) || file.originalFile.type === 'image/heic' || file.originalFile.type === 'image/heif') ? '✅ Converted' : '✅ Compatible'
                      )}
                      {file.status === 'error' && '❌ Failed'}
                    </div>
                    {file.error && (
                      <div className="file-error">{file.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
