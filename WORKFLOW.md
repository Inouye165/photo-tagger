# HEIC to JPEG Conversion Workflow

## Step 1: Convert Your HEIC Files

### Option A: Simple Batch Converter (Windows)
1. **Double-click** `batch-convert.bat`
2. **Enter the path** to your HEIC photos folder (e.g., `C:\Users\inouy\Pictures`)
3. **Wait for conversion** - all HEIC files will be converted to JPEG with metadata preserved
4. **Files saved to** `converted-jpegs\` folder

### Option B: Command Line (Any folder)
```bash
# Convert entire folder
node heic-converter.js "C:\Users\inouy\Pictures" ".\converted-jpegs"

# Convert Downloads folder
node heic-converter.js "C:\Users\inouy\Downloads" ".\converted-jpegs"
```

## Step 2: Use Your Photo App

1. **Open** http://localhost:5174 in your browser
2. **Load JPEG files** from the `converted-jpegs\` folder
3. **View photos** with full metadata and GPS preserved

## What Gets Preserved

✅ **GPS coordinates** - Map shows exact location  
✅ **Camera settings** - ISO, aperture, shutter speed  
✅ **Timestamps** - When photo was taken  
✅ **Device info** - iPhone model, lens info  
✅ **All EXIF data** - Complete metadata

## Example Workflow

```
Your HEIC Files:
├── IMG_6408.HEIC
├── IMG_6409.HEIC
└── IMG_6410.HEIC

↓ Run batch-convert.bat ↓

Converted JPEG Files:
├── IMG_6408.jpg (with all metadata)
├── IMG_6409.jpg (with all metadata)
└── IMG_6410.jpg (with all metadata)

↓ Load in photo app ↓

✅ Photos display perfectly
✅ GPS maps show locations
✅ All metadata accessible
```

## Benefits of This Workflow

- **No browser limitations** - All HEICs convert successfully
- **Full metadata preservation** - GPS, camera settings, timestamps
- **Batch processing** - Convert hundreds of files at once
- **Universal compatibility** - JPEGs work everywhere
- **One-time conversion** - Keep both originals and JPEGs

## Folder Structure

```
photo-tagger/
├── batch-convert.bat          ← Double-click to convert
├── heic-converter.js          ← Advanced conversion script
├── converted-jpegs/           ← Your converted files appear here
└── src/                       ← Photo app source code
```
