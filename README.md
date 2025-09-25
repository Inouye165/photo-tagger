# Photo Tagger (Photo Metadata Viewer)

Client-side app to preview images, extract EXIF metadata, convert HEIC to JPEG for preview, and show GPS location on an interactive map.

All processing happens in your browser. No files are uploaded.

## Features
- Load photos (HEIC/HEIF, JPEG, PNG, etc.)
- HEIC is converted to JPEG in-browser for preview
- EXIF parsing with GPS extraction
- Map display using Leaflet with multiple base layers
- Copy actions: GPS coordinates and full metadata JSON
- Metadata panel hidden by default (toggle to view)
- Responsive layout: left = image preview, right = map + metadata controls

## Tech
- React 18 + TypeScript + Vite
- EXIF parsing: exifreader
- HEIC conversion: heic2any
- Map: leaflet + react-leaflet
- Tests: Vitest + Testing Library

## Getting started
Requirements: Node 18+ (Node 20 recommended) and npm.

```bash
npm install
npm run dev
```
Open the URL printed by Vite (typically http://localhost:5173).

To build and preview production:
```bash
npm run build
npm run preview
```

## Usage
1. Click "Choose Image" and select a photo.
2. If the file is HEIC, it is converted to JPEG automatically for the preview on the left.
3. If GPS EXIF is present, a map appears on the right at that location.
4. Use the toolbar under the map to:
   - Show/Hide metadata
   - Copy metadata JSON
   - Copy GPS (lat, lng)
5. Use the map buttons to enlarge or open in fullscreen.

Notes:
- Many exported or shared JPEGs have EXIF stripped; prefer an original photo with Location enabled to see the map.
- The app never uploads your files.

## Scripts
```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run preview   # preview the production build
npm run test      # run tests in watch mode
npm run test:run  # run tests once (CI)
npm run test:ui   # Vitest UI
```

## Tests
- Unit tests for GPS parsing (parseGpsFromExif).
- Component tests for the main app (HEIC handling, GPS/no-GPS states, metadata toggle, copy buttons).
- A smoke test imports the real entry (src/main.tsx) to catch syntax/entry regressions.

Run once:
```bash
npm run test:run
```

## Troubleshooting
- Map not showing: the selected image likely lacks GPS EXIF. Try an original phone photo with Location enabled.
- Tiles blocked: some ad-blockers or corporate proxies block external tile servers.
- Do not open index.html directly from disk; always use npm run dev or npm run preview.

## License
This project is provided as-is. Add a license if you plan to distribute.
