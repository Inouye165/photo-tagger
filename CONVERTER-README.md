# HEIC to JPEG Converter with Metadata Preservation

This tool converts HEIC files to JPEG while preserving all metadata (EXIF, GPS, etc.).

## Quick Setup

### Option 1: ImageMagick (Recommended - Best Metadata Preservation)

**Windows:**
```bash
# Install ImageMagick
choco install imagemagick
# Or download from: https://imagemagick.org/script/download.php#windows

# Convert your photos
node heic-converter.js "C:\Users\YourName\Photos" "C:\Users\YourName\Converted"
```

**macOS:**
```bash
# Install ImageMagick
brew install imagemagick

# Convert your photos
node heic-converter.js ~/Pictures/HEIC ~/Pictures/Converted
```

**Linux:**
```bash
# Install ImageMagick
sudo apt install imagemagick
# or: sudo yum install ImageMagick

# Convert your photos
node heic-converter.js ~/Pictures/HEIC ~/Pictures/Converted
```

### Option 2: Node.js Only (Fallback)

If you can't install ImageMagick:

```bash
# Install dependencies
npm install --save libheif-js sharp

# Convert your photos
node heic-converter.js ./input-folder ./output-folder
```

## Usage Examples

**Convert entire folder:**
```bash
node heic-converter.js ./my-heic-photos ./converted-jpegs
```

**Convert single file:**
```bash
node heic-converter.js photo.heic photo.jpg
```

**Batch convert with ImageMagick (preserves ALL metadata):**
```bash
# This preserves GPS, camera settings, timestamps, etc.
node heic-converter.js "~/iPhone Photos" "~/JPEG Photos"
```

## What Gets Preserved

**With ImageMagick (recommended):**
- ✅ GPS coordinates
- ✅ Camera settings (ISO, aperture, etc.)
- ✅ Timestamps
- ✅ Device info
- ✅ All EXIF/IPTC/XMP data

**With libheif-js fallback:**
- ✅ Basic image conversion
- ⚠️ Some metadata may be lost
- ⚠️ GPS might not transfer

## Troubleshooting

**"magick: command not found":**
- Install ImageMagick (see setup above)
- Restart your terminal

**"Cannot find module 'libheif-js'":**
```bash
npm install libheif-js sharp
```

**Permission errors:**
- Make sure you have read access to input folder
- Make sure you have write access to output folder

**HDR/10-bit HEIC files:**
- ImageMagick handles these better than browser-based tools
- Some very new HEIC variants might still fail

## Integration with Your Photo App

After conversion, you can:
1. Load the converted JPEGs in your photo metadata viewer
2. All GPS data and metadata will be preserved
3. Images will display properly in browsers

The converted files will work perfectly with your existing photo-tagger app!
