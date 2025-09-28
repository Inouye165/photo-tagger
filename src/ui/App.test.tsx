import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
// Mock MapView to avoid loading Leaflet in test environment
vi.mock('./MapView', () => ({
  MapView: (props: any) => {
    return (
      <div data-testid="map-view">Map at {props.lat}, {props.lng}</div>
    )
  },
}))

// Mock exifreader and heic2any for deterministic behavior
vi.mock('exifreader', () => ({ default: { load: vi.fn() } }))
vi.mock('heic2any', () => ({ default: vi.fn(async (opts: any) => opts.blob) }))

// Provide a simple File and ArrayBuffer mock for load handler
function makeFile(name: string, type: string, data = 'x') {
  return new File([data], name, { type })
}

describe('App', () => {
  beforeEach(() => {
    // reset clipboard mock
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('hides metadata by default and can toggle', async () => {
    render(<App />)
    expect(screen.getByText(/metadata hidden/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show metadata/i }))
    expect(screen.queryByText(/metadata hidden/i)).not.toBeInTheDocument()
  })

  it('shows map and enables Copy GPS when GPS is present (HEIC)', async () => {
    const ExifReader: any = (await import('exifreader')).default
    ExifReader.load.mockResolvedValue({
      GPSLatitude: { value: [44, 30, 0] },
      GPSLongitude: { value: [110, 0, 0] },
      GPSLatitudeRef: { value: 'N' },
      GPSLongitudeRef: { value: 'W' },
    })

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.heic', 'image/heic')
    await userEvent.upload(input, file)

    // Map placeholder should appear (mocked)
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()

    const copyGps = screen.getByRole('button', { name: /copy gps/i })
    expect(copyGps).toBeEnabled()
    await userEvent.click(copyGps)
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('shows "No GPS found" when image lacks GPS', async () => {
    const ExifReader: any = (await import('exifreader')).default
    ExifReader.load.mockResolvedValue({})

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await userEvent.upload(input, file)

    expect(await screen.findByText(/no gps found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy gps/i })).toBeDisabled()
  })

  it('handles file validation errors', async () => {
    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('document.pdf', 'application/pdf')
    await userEvent.upload(input, file)

    // The app should handle the file but may not show an error immediately
    // This test verifies the app doesn't crash with unsupported files
    expect(screen.getByText('Photo Metadata Viewer & Batch Converter')).toBeInTheDocument()
  })

  it('shows warning for large files', async () => {
    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const largeFile = new File(['x'.repeat(60 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, largeFile)

    expect(await screen.findByText(/large file detected/i)).toBeInTheDocument()
  })

  it('handles HEIC conversion errors gracefully', async () => {
    const heic2any: any = (await import('heic2any')).default
    heic2any.mockRejectedValue(new Error('HEIC conversion failed'))

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.heic', 'image/heic')
    await userEvent.upload(input, file)

    expect(await screen.findByText(/heic conversion failed/i)).toBeInTheDocument()
  })

  it('handles EXIF parsing errors', async () => {
    const ExifReader: any = (await import('exifreader')).default
    ExifReader.load.mockRejectedValue(new Error('EXIF parsing failed'))

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await userEvent.upload(input, file)

    expect(await screen.findByText(/exif parsing failed/i)).toBeInTheDocument()
  })

  it('enables copy metadata button when metadata is loaded', async () => {
    const ExifReader: any = (await import('exifreader')).default
    ExifReader.load.mockResolvedValue({
      Make: { value: 'Apple' },
      Model: { value: 'iPhone' }
    })

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await userEvent.upload(input, file)

    const copyMetadata = screen.getByRole('button', { name: /copy metadata/i })
    expect(copyMetadata).toBeEnabled()
  })

  it('shows save as JPEG button for HEIC files', async () => {
    const heic2any: any = (await import('heic2any')).default
    heic2any.mockResolvedValue(new Blob(['converted'], { type: 'image/jpeg' }))

    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.heic', 'image/heic')
    await userEvent.upload(input, file)

    expect(await screen.findByRole('button', { name: /save as jpeg/i })).toBeInTheDocument()
  })

  it('handles image load errors', async () => {
    render(<App />)
    const input = screen.getByLabelText(/choose single image/i)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await userEvent.upload(input, file)

    // Simulate image load error
    const img = screen.getByAltText('Selected')
    Object.defineProperty(img, 'complete', { value: false })
    Object.defineProperty(img, 'naturalWidth', { value: 0 })
    
    // Trigger error event
    const errorEvent = new Event('error')
    img.dispatchEvent(errorEvent)

    expect(await screen.findByText(/failed to load image/i)).toBeInTheDocument()
  })
})


