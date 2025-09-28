# Photo Tagger (AI-Powered Photo Analysis & Captioning)

An intelligent photo analysis application that combines local EXIF metadata extraction with AI-powered visual analysis to generate detailed descriptions and enable interactive photo captioning. Perfect for photographers, researchers, and anyone who wants AI-powered photo insights.

**🔒 Privacy-First**: All EXIF processing happens locally. AI analysis uses secure API calls with your own OpenAI key.

## ✨ Features

### 🤖 **AI-Powered Analysis**
- **Visual Analysis**: GPT-4 Vision analyzes photos for people, objects, settings, and mood
- **Intelligent Descriptions**: Detailed photo descriptions combining EXIF data and visual analysis
- **Smart Keywords**: AI-generated tags for better photo organization
- **Contextual Insights**: Time of day, weather, composition, and emotional tone detection

### 📝 **Interactive Captioning**
- **Multiple Captions**: Add unlimited text overlays to photos
- **Smart Placement**: AI-suggested positioning with automatic margin detection
- **Drag & Drop**: Manual caption positioning with real-time preview
- **Style Options**: Customizable fonts, colors, sizes, and positioning
- **One-Shot Placement**: Intelligent caption placement with margin clamping

### 📸 **Image Support**
- **All major formats**: JPEG, PNG, GIF, WebP, HEIC, HEIF
- **HEIC Conversion**: Automatic in-browser conversion to JPEG for preview
- **Dual conversion engines**: libheif-js and heic2any with automatic fallback
- **Large file support**: Handles files up to 50MB+ with performance warnings

### 🗺️ **GPS & Mapping**
- **Interactive maps**: Powered by Leaflet with multiple base layers
- **GPS extraction**: Automatic coordinate parsing from EXIF data
- **Location display**: Pinpoint exact photo locations on map
- **Reverse geocoding**: Convert coordinates to human-readable place names
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
- **OpenAI API Key** (for AI analysis features)

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd photo-tagger

# Install dependencies
npm install

# Create environment file
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env

# Start development server
npm run dev
```

### Environment Setup
Create a `.env` file in the project root with your OpenAI API key:
```env
OPENAI_API_KEY=your_openai_api_key_here
# Optional: Customize AI models
OPENAI_MODEL_VISION=gpt-4o
OPENAI_MODEL_TEXT=gpt-4o-mini
```

Open your browser to `http://localhost:5173` and start analyzing photos!

## 📖 Usage Guide

### Basic Workflow
1. **Load a Photo**: Click "Choose Image" and select any supported image file
2. **AI Analysis**: The app automatically analyzes the photo and generates a detailed description
3. **View Results**: See AI-generated description, keywords, and metadata on the right panel
4. **Add Captions**: Use natural language to add and position text overlays on your photo
5. **Explore GPS**: If the photo has location data, an interactive map appears
6. **Copy Data**: Use the toolbar buttons to copy GPS coordinates, keywords, or full metadata

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
- **Backend**: Node.js + Express + TypeScript
- **AI Integration**: OpenAI GPT-4 Vision + GPT-4o-mini
- **EXIF parsing**: exifreader (comprehensive metadata extraction)
- **HEIC conversion**: heic2any + libheif-js (dual-engine approach)
- **Mapping**: Leaflet + React-Leaflet (interactive maps)
- **Reverse Geocoding**: Nominatim API (OpenStreetMap)
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
│   │   ├── MapView.tsx      # Interactive map component
│   │   ├── BatchConverter.tsx # Batch HEIC conversion UI
│   │   └── FolderUpload.tsx # Folder upload component
│   ├── utils/
│   │   ├── gps.ts          # GPS coordinate parsing
│   │   ├── heic.ts         # HEIC conversion utilities
│   │   └── summary.ts      # EXIF summary generation
│   └── main.tsx            # Application entry point
├── server.ts               # Express backend with AI integration
├── heic-converter.js       # Batch HEIC conversion tool
├── batch-convert.bat       # Windows batch converter
└── converted-photos/       # Output directory for conversions
```

## 🔧 Development Scripts

```bash
npm run dev       # Start development server (frontend)
npm run server    # Start backend server with AI integration
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

