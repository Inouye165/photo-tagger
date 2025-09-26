export async function convertHeicToJpegBlob(input: Blob, quality = 0.92): Promise<Blob> {
  // Load ESM pre-bundled WASM to avoid external .wasm fetch issues
  const mod: any = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
  const heifNS: any = (mod && mod.HeifDecoder) ? mod : mod.default
  if (!heifNS || !heifNS.HeifDecoder) throw new Error('libheif not available')

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


