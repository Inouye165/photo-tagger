import { describe, it, expect } from 'vitest'
import { parseGpsFromExif } from './gps'

describe('parseGpsFromExif', () => {
  it('parses numeric array GPS with refs', () => {
    const tags: any = {
      GPSLatitude: { value: [44, 30, 0] },
      GPSLongitude: { value: [110, 0, 0] },
      GPSLatitudeRef: { value: 'N' },
      GPSLongitudeRef: { value: 'W' },
    }
    const res = parseGpsFromExif(tags)
    expect(res).toBeTruthy()
    expect(res!.lat).toBeCloseTo(44.5, 5)
    expect(res!.lng).toBeCloseTo(-110, 5)
  })

  it('parses DMS string with hemisphere', () => {
    const tags: any = {
      GPSLatitude: { description: '44°30\'0"' },
      GPSLongitude: { description: '110°0\'0"' },
      GPSLatitudeRef: { description: 'S' },
      GPSLongitudeRef: { description: 'E' },
    }
    const res = parseGpsFromExif(tags)
    expect(res).toEqual({ lat: -44.5, lng: 110 })
  })

  it('returns null for invalid or missing data', () => {
    expect(parseGpsFromExif({} as any)).toBeNull()
    expect(parseGpsFromExif({ GPSLatitude: { value: 999 }, GPSLongitude: { value: 0 } } as any)).toBeNull()
  })
})


