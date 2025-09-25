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
    const input = screen.getByLabelText(/choose image/i)
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
    const input = screen.getByLabelText(/choose image/i)
    const file = makeFile('photo.jpg', 'image/jpeg')
    await userEvent.upload(input, file)

    expect(await screen.findByText(/no gps found/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy gps/i })).toBeDisabled()
  })
})


