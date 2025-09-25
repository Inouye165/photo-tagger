import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// This test imports the real entry file to catch syntax errors and basic render regressions
describe('entrypoint main.tsx', () => {
  it('imports without throwing (catches syntax errors in entry)', async () => {
    // Avoid Worker usage inside heic2any on import
    vi.mock('heic2any', () => ({ default: vi.fn() }))
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost/'
    })
    // @ts-ignore: assign globals for ReactDOM
    globalThis.document = dom.window.document as any
    // @ts-ignore
    globalThis.window = dom.window as any
    // Importing should not throw
    // Import the real entry; if there is a syntax error or fatal import issue,
    // this will throw and fail the test.
    await import('./main')
    // If we got here, import succeeded.
    expect(true).toBe(true)
  })
})


