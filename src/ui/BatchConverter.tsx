import { useState, useCallback, useRef } from 'react'

interface BatchConverterProps {
  onConversionComplete?: (outputFolder: string, convertedCount: number) => void
}

export function BatchConverter({ onConversionComplete }: BatchConverterProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [outputFolder, setOutputFolder] = useState('')
  const [convertedCount, setConvertedCount] = useState(0)
  const [selectedSavePath, setSelectedSavePath] = useState('C:\\Users\\Ron\\OneDrive\\Pictures\\Yellowstone 2025\\working phots')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const convertImageWithImageMagick = useCallback(async (file: File, outputPath: string): Promise<boolean> => {
    try {
      // For browser-based conversion, create a FormData and send to backend
      const formData = new FormData()
      formData.append('file', file)
      formData.append('outputPath', outputPath)

      const response = await fetch('http://localhost:3001/api/convert-image', {
        method: 'POST',
        mode: 'cors',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Conversion failed: ${response.statusText}`)
      }

      return true
    } catch (error) {
      console.error(`Failed to convert ${file.name}:`, error)

      // Fallback to browser-based conversion for supported formats
      if (file.type.startsWith('image/') && file.type !== 'image/heic' && file.type !== 'image/heif') {
        try {
          await convertImageToJpeg(file, outputPath)
          return true
        } catch (fallbackError) {
          console.error(`Fallback conversion also failed for ${file.name}:`, fallbackError)
        }
      }

      return false
    }
  }, [])

  const processFiles = useCallback(async (files: File[], folderName: string) => {
    setIsProcessing(true)
    setStatus('Processing files...')
    setConvertedCount(0)

    try {
      // Create output folder name
      const outputFolderName = `${folderName}-converted`
      const fullOutputPath = selectedSavePath || outputFolderName

      let converted = 0
      const totalFiles = files.filter(file =>
        !file.name.toLowerCase().endsWith('.jpg') &&
        !file.name.toLowerCase().endsWith('.jpeg')
      ).length

      setStatus(`Converting ${totalFiles} files to ${fullOutputPath}...`)

      // Send files to backend for conversion
      const conversionPromises = files
        .filter(file => !file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg'))
        .map(async (file, index) => {
          const outputFileName = file.name.replace(/\.[^.]+$/, '.jpg')
          const outputPath = `${fullOutputPath}\\${outputFileName}`

          try {
            const success = await convertImageWithImageMagick(file, outputPath)
            if (success) {
              converted++
              setConvertedCount(converted)
              setStatus(`Converted ${converted}/${totalFiles} files...`)
            }
            return { file: file.name, success, outputPath }
          } catch (error) {
            console.error(`Failed to convert ${file.name}:`, error)
            return { file: file.name, success: false, error: error.message }
          }
        })

      const results = await Promise.all(conversionPromises)

      const successCount = results.filter(r => r.success).length
      setOutputFolder(fullOutputPath)
      setStatus(`Conversion complete! ${successCount} files converted to ${fullOutputPath}`)

      onConversionComplete?.(fullOutputPath, successCount)

    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
      console.error('Conversion error:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [onConversionComplete, selectedSavePath, convertImageWithImageMagick])

  const chooseSaveLocation = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleSavePathChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // For webkitdirectory, we get the directory structure
      const selectedPath = files[0].webkitRelativePath
      if (selectedPath) {
        // Extract the directory path (everything before the filename)
        const pathParts = selectedPath.split('/')
        const directoryPath = pathParts.slice(0, -1).join('/')
        setSelectedSavePath(directoryPath)
      } else {
        // Fallback: use the filename as directory name
        const fileName = files[0].name
        const dirName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName
        setSelectedSavePath(dirName)
      }
    }
  }, [])

  const convertImageToJpeg = async (file: File, outputPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height

        if (ctx) {
          ctx.drawImage(img, 0, 0)

          canvas.toBlob((blob) => {
            if (blob) {
              // For browser-based conversion, download the file
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = outputPath.split('\\').pop() || 'converted.jpg'
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
              resolve()
            } else {
              reject(new Error('Failed to create blob'))
            }
          }, 'image/jpeg', 0.92)
        } else {
          reject(new Error('Failed to get canvas context'))
        }
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = URL.createObjectURL(file)
    })
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const items = Array.from(e.dataTransfer.items)
    const files: File[] = []
    let folderName = 'uploaded-folder'

    const processItems = async () => {
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry && entry.isDirectory) {
            // Handle folder - extract folder name
            folderName = entry.name
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
        await processFiles(files, folderName)
      }
    }

    processItems()
  }, [processFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

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
                  // Include all image files for conversion
                  if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|raw|cr2|nef|arw)$/i.test(file.name)) {
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
    <div className="batch-converter">
      <div className="converter-section">
        <h2>📁 Batch Image Converter</h2>
        <p>Drop a folder to convert all non-JPG images to JPG format. Creates a subfolder with "-converted" suffix.</p>

        <div className="save-location-selector">
          <label htmlFor="savePath">Save Location:</label>
          <div className="save-path-input">
            <input
              id="savePath"
              type="text"
              value={selectedSavePath}
              onClick={chooseSaveLocation}
              onChange={(e) => setSelectedSavePath(e.target.value)}
              placeholder="C:\Users\Ron\OneDrive\Pictures\Yellowstone 2025\working phots"
            />
            <button type="button" onClick={chooseSaveLocation} className="browse-btn">
              Browse
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            webkitdirectory=""
            onChange={handleSavePathChange}
            style={{ display: 'none' }}
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
            <p>Converts all non-JPG images to JPG format</p>
            <p className="drop-zone-info">
              Supported formats: PNG, GIF, WebP, HEIC, HEIF, BMP, TIFF, RAW, CR2, NEF, ARW, and more
            </p>
          </div>
        </div>

        {isProcessing && (
          <div className="processing-status">
            <div className="status-text">{status}</div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(convertedCount / Math.max(convertedCount, 1)) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {outputFolder && !isProcessing && (
          <div className="conversion-result">
            <h3>✅ Conversion Complete!</h3>
            <p><strong>Output folder:</strong> {outputFolder}</p>
            <p><strong>Files converted:</strong> {convertedCount}</p>
            <div className="result-actions">
              <button
                className="action-btn"
                onClick={() => {
                  // In a real implementation, this would open the output folder
                  alert(`Converted files are in: ${outputFolder}`)
                }}
              >
                View Converted Files
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
