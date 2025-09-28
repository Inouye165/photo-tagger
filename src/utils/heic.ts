export async function convertHeicToJpegBlob(input: Blob, quality = 0.92): Promise<Blob> {
  let heifNS: any

  try {
    // Try different import paths for libheif
    console.log('Loading libheif...')

    let mod: any
    try {
      // Try the WASM bundle path
      mod = await import('libheif-js/wasm')
    } catch (err1) {
      console.log('WASM import failed, trying direct import...')
      try {
        // Try direct import
        mod = await import('libheif-js')
      } catch (err2) {
        console.log('Direct import failed, trying bundle path...')
        // Try bundle path
        mod = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
      }
    }

    console.log('libheif module loaded:', !!mod)

    // Try different ways to access the decoder
    if (mod && mod.HeifDecoder) {
      heifNS = mod
    } else if (mod && mod.default && mod.default.HeifDecoder) {
      heifNS = mod.default
    } else if (mod && mod.default) {
      heifNS = mod.default
    } else {
      heifNS = mod
    }

    console.log('heifNS:', !!heifNS, 'HeifDecoder:', !!heifNS?.HeifDecoder)

    if (!heifNS || !heifNS.HeifDecoder) {
      console.error('HeifDecoder not found in module:', Object.keys(heifNS || {}))
      throw new Error('libheif decoder not available')
    }
  } catch (importErr) {
    console.error('Failed to import libheif:', importErr)
    throw new Error('libheif not available')
  }

  const arrayBuffer = await input.arrayBuffer()
  const decoder = new heifNS.HeifDecoder()
  const data = decoder.decode(new Uint8Array(arrayBuffer))
  if (!data || !data.length) throw new Error('No image in HEIC container')
  const image = data[0]
  const width = image.get_width()
  const height = image.get_height()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  const imageData = ctx.createImageData(width, height)

  await new Promise<void>((resolve, reject) => {
    image.display(imageData, (displayData: any) => {
      if (!displayData) return reject(new Error('HEIF processing error'))
      resolve()
    })
  })

  ctx.putImageData(imageData, 0, 0)

  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Failed to create JPEG blob')
  
  // Note: Browser-based conversion loses metadata. For full metadata preservation,
  // the HEIC should be converted server-side or with the CLI tool using ImageMagick.
  return blob
}


