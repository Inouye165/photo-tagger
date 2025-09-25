import '@testing-library/jest-dom'

// Polyfill blob URL APIs used by the app during tests
if (!(URL as any).createObjectURL) {
  (URL as any).createObjectURL = () => 'blob://test'
}
if (!(URL as any).revokeObjectURL) {
  ;(URL as any).revokeObjectURL = () => {}
}

// Polyfill Blob/File.arrayBuffer in jsdom
const anyBlob: any = Blob.prototype as any
if (typeof anyBlob.arrayBuffer !== 'function') {
  anyBlob.arrayBuffer = async function () {
    return new ArrayBuffer(0)
  }
}
const anyFileProto: any = (globalThis as any).File?.prototype
if (anyFileProto && typeof anyFileProto.arrayBuffer !== 'function') {
  anyFileProto.arrayBuffer = async function () {
    return new ArrayBuffer(0)
  }
}


