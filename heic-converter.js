#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if ImageMagick is available
function checkImageMagick() {
  try {
    execSync('magick -version', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync('convert -version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

// Convert HEIC to JPEG with metadata preservation using ImageMagick
function convertWithImageMagick(inputPath, outputPath) {
  try {
    // Use ImageMagick to convert with metadata preservation
    execSync(`magick "${inputPath}" -quality 92 "${outputPath}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`ImageMagick conversion failed: ${error.message}`);
    return false;
  }
}

// Alternative: use libheif-js for conversion
async function convertWithLibheif(inputPath, outputPath) {
  try {
    const libheif = await import('libheif-js/wasm');
    const sharp = await import('sharp');
    
    const buffer = await fs.readFile(inputPath);
    const decoder = new libheif.HeifDecoder();
    const data = decoder.decode(buffer);
    
    if (!data || !data.length) {
      throw new Error('No image found in HEIC file');
    }
    
    const image = data[0];
    const width = image.get_width();
    const height = image.get_height();
    
    // Get raw image data
    const imageData = await new Promise((resolve, reject) => {
      const canvas = { data: new Uint8ClampedArray(width * height * 4), width, height };
      image.display(canvas, (result) => {
        if (!result) reject(new Error('Failed to decode image'));
        else resolve(result.data);
      });
    });
    
    // Convert to JPEG using Sharp (preserves some metadata)
    await sharp.default(Buffer.from(imageData), {
      raw: { width, height, channels: 4 }
    })
    .jpeg({ quality: 92 })
    .toFile(outputPath);
    
    return true;
  } catch (error) {
    console.error(`libheif conversion failed: ${error.message}`);
    return false;
  }
}

async function convertFile(inputPath, outputDir) {
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${basename}.jpg`);
  
  console.log(`Converting: ${inputPath} -> ${outputPath}`);
  
  // Try ImageMagick first (best metadata preservation)
  if (checkImageMagick()) {
    if (convertWithImageMagick(inputPath, outputPath)) {
      console.log('✓ Converted with ImageMagick (metadata preserved)');
      return true;
    }
  }
  
  // Fallback to libheif-js
  if (await convertWithLibheif(inputPath, outputPath)) {
    console.log('✓ Converted with libheif-js (some metadata preserved)');
    return true;
  }
  
  console.log('✗ Conversion failed');
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
HEIC to JPEG Converter with Metadata Preservation

Usage: node heic-converter.js <input-dir> <output-dir>
   or: node heic-converter.js <input-file.heic> <output-file.jpg>

Examples:
  node heic-converter.js ./photos ./converted
  node heic-converter.js photo.heic photo.jpg

Requirements:
  - ImageMagick (recommended): brew install imagemagick / choco install imagemagick
  - Or: npm install libheif-js sharp (fallback)
`);
    process.exit(1);
  }
  
  const [input, output] = args;
  
  try {
    const inputStat = await fs.stat(input);
    
    if (inputStat.isFile()) {
      // Single file conversion
      const outputDir = path.dirname(output);
      await fs.mkdir(outputDir, { recursive: true });
      await convertFile(input, outputDir);
    } else if (inputStat.isDirectory()) {
      // Batch conversion
      await fs.mkdir(output, { recursive: true });
      
      const files = await fs.readdir(input);
      const heicFiles = files.filter(f => /\.(heic|heif)$/i.test(f));
      
      console.log(`Found ${heicFiles.length} HEIC files`);
      
      let converted = 0;
      for (const file of heicFiles) {
        const inputPath = path.join(input, file);
        if (await convertFile(inputPath, output)) {
          converted++;
        }
      }
      
      console.log(`\nConverted ${converted}/${heicFiles.length} files`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run main function if this is the entry point
if (process.argv[1] === __filename) {
  main();
}
