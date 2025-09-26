# Photo Tagger (Photo Metadata Viewer)

A comprehensive client-side application for viewing photos, extracting metadata, and displaying GPS locations. Perfect for photographers, researchers, and anyone who needs to analyze image metadata.

**🔒 Privacy-First**: All processing happens in your browser. No files are uploaded to any server.

## ✨ Features

### 📸 **Image Support**
- **All major formats**: JPEG, PNG, GIF, WebP, HEIC, HEIF
- **HEIC Conversion**: Automatic in-browser conversion to JPEG for preview
- **Dual conversion engines**: libheif-js and heic2any with automatic fallback
- **Large file support**: Handles files up to 50MB+ with performance warnings

### 🗺️ **GPS & Mapping**
- **Interactive maps**: Powered by Leaflet with multiple base layers
- **GPS extraction**: Automatic coordinate parsing from EXIF data
- **Location display**: Pinpoint exact photo locations on map
- **Fullscreen maps**: Expandable map view for detailed exploration

### 📊 **Metadata Analysis**
- **Complete EXIF data**: Camera settings, timestamps, device info
- **GPS coordinates**: Latitude, longitude, altitude, speed, direction
- **IPTC & XMP**: Additional metadata standards support
- **Copy functionality**: Export GPS coordinates and full metadata JSON

### 🛡️ **Error Handling**
- **Detailed error messages**: Clear explanations when images fail to load
- **File validation**: Type and size checking with helpful suggestions
- **Conversion fallbacks**: Multiple strategies for HEIC processing
- **Corruption detection**: Identifies and reports damaged files
- **Image load detection**: Catches and reports image display failures
- **EXIF parsing errors**: Graceful handling of metadata extraction failures

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (Node 20+ recommended)
- **npm** or **yarn**

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd photo-tagger

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser to `http://localhost:5173` and start analyzing photos!

## 📖 Usage Guide

### Basic Workflow
1. **Load a Photo**: Click "Choose Image" and select any supported image file
2. **View Image**: The photo displays on the left with full metadata on the right
3. **Explore GPS**: If the photo has location data, an interactive map appears
4. **Copy Data**: Use the toolbar buttons to copy GPS coordinates or full metadata

### HEIC Files
- **Automatic conversion**: HEIC files are converted to JPEG for browser display
- **Dual engines**: Uses both libheif-js and heic2any for maximum compatibility
- **Download option**: Save the converted JPEG with preserved metadata
- **Fallback support**: If conversion fails, tries EXIF thumbnail

### Error Troubleshooting

#### ❌ **"Image not displaying"**
- **Check file format**: Ensure it's a supported format (JPEG, PNG, GIF, WebP, HEIC, HEIF)
- **File corruption**: Try opening the file in another application first
- **Large files**: Files >50MB may process slowly
- **HEIC issues**: Try the batch converter (see CONVERTER-README.md)

#### ❌ **"No GPS found"**
- **Location services**: Ensure location was enabled when photo was taken
- **EXIF stripping**: Some apps remove GPS data when sharing
- **Original files**: Use original photos, not edited/shared versions

#### ❌ **"HEIC conversion failed"**
- **HDR/10-bit files**: Some advanced HEIC formats aren't supported
- **iOS settings**: Set Camera → Formats → Most Compatible
- **Alternative**: Use the batch converter for problematic files

## 🛠️ Technical Stack

- **Frontend**: React 18 + TypeScript + Vite
- **EXIF parsing**: exifreader (comprehensive metadata extraction)
- **HEIC conversion**: heic2any + libheif-js (dual-engine approach)
- **Mapping**: Leaflet + React-Leaflet (interactive maps)
- **Testing**: Vitest + Testing Library (comprehensive test coverage)

## 🧪 Testing

### Test Coverage
- **Unit tests**: GPS parsing, metadata extraction, utility functions
- **Component tests**: App behavior, HEIC handling, error states
- **Integration tests**: File upload, conversion, map display
- **Error scenarios**: Invalid files, conversion failures, network issues

### Running Tests
```bash
# Run all tests
npm run test:run

# Watch mode (development)
npm run test

# Interactive UI
npm run test:ui
```

### Test Scenarios Covered
- ✅ **File validation**: Unsupported formats, large files, corrupted data
- ✅ **HEIC conversion**: Both engines, fallback scenarios, error handling
- ✅ **GPS extraction**: Valid coordinates, missing data, malformed EXIF
- ✅ **Image display**: Load success/failure, format support
- ✅ **User interactions**: Copy functions, map controls, metadata toggle
- ✅ **Error scenarios**: Invalid files, conversion failures, network issues
- ✅ **EXIF parsing**: Metadata extraction success/failure
- ✅ **Image load errors**: Corrupted files, format issues

## 📁 Project Structure

```
photo-tagger/
├── src/
│   ├── ui/
│   │   ├── App.tsx          # Main application component
│   │   └── MapView.tsx      # Interactive map component
│   ├── utils/
│   │   ├── gps.ts          # GPS coordinate parsing
│   │   └── heic.ts         # HEIC conversion utilities
│   └── main.tsx            # Application entry point
├── heic-converter.js       # Batch HEIC conversion tool
├── batch-convert.bat       # Windows batch converter
└── converted-photos/       # Output directory for conversions
```

## 🔧 Development Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run preview   # Preview production build
npm run test      # Run tests in watch mode
npm run test:run  # Run tests once (CI)
npm run test:ui   # Interactive test UI
```

## 🚨 Common Issues & Solutions

### Development Issues
- **"vite not found"**: Run `npm install` to install dependencies
- **Port conflicts**: Change port with `npm run dev -- --port 3000`
- **TypeScript errors**: Check `tsconfig.json` configuration

### Runtime Issues
- **Map tiles not loading**: Check ad-blockers, try different network
- **HEIC conversion slow**: Large files take time, consider batch converter
- **Memory issues**: Close other browser tabs, restart browser

### Production Issues
- **Build failures**: Check Node.js version (18+ required)
- **Static hosting**: Ensure proper MIME types for .heic files
- **CORS issues**: All processing is client-side, no CORS concerns

## 📄 License

This project is provided as-is for educational and personal use. Add appropriate licensing for distribution.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📚 Additional Resources

- **HEIC Conversion**: See `CONVERTER-README.md` for batch processing
- **Workflow Guide**: See `WORKFLOW.md` for complete usage workflow
- **EXIF Standards**: [EXIF.org](https://www.exif.org/) for metadata specifications

