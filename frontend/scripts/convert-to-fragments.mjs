#!/usr/bin/env node
/**
 * IFC to Fragments Converter (Node.js)
 *
 * Converts IFC files to ThatOpen Fragments format for 10-100x faster loading.
 *
 * Usage:
 *   node convert-to-fragments.mjs input.ifc output.frag
 *
 * Requirements:
 *   - Node.js 18+
 *   - @thatopen/components package installed
 *
 * This script is called by Django backend (apps/models/services/fragments.py)
 * as part of the automated Fragment generation pipeline.
 */

import * as OBC from '@thatopen/components';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert IFC file to Fragments format
 */
async function convertToFragments(inputPath, outputPath) {
  console.log(`🔧 Converting ${inputPath} to Fragments...`);
  console.log(`   Output: ${outputPath}`);

  // Validate input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const startTime = Date.now();

  try {
    // Initialize Components
    console.log('   1/4 Initializing Components...');
    const components = new OBC.Components();

    // Setup FragmentsManager
    console.log('   2/4 Setting up FragmentsManager...');
    const fragments = components.get(OBC.FragmentsManager);
    // Note: FragmentsManager no longer has init() method in v2.4+

    // Setup IFC Loader
    console.log('   3/4 Setting up IFC Loader...');
    const ifcLoader = components.get(OBC.IfcLoader);

    // Resolve path to local web-ifc WASM files
    // Script location: frontend/scripts/convert-to-fragments.mjs
    // WASM location: frontend/node_modules/web-ifc/
    const wasmPath = path.join(__dirname, '..', 'node_modules', 'web-ifc');

    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: wasmPath + '/',
        absolute: true,
      },
    });

    // Load IFC file
    console.log('   4/4 Loading IFC file...');
    const ifcData = fs.readFileSync(inputPath);
    const buffer = new Uint8Array(ifcData);

    let loadProgress = 0;
    const model = await ifcLoader.load(buffer, false, path.basename(inputPath), {
      processData: {
        progressCallback: (progress) => {
          const currentProgress = Math.floor(progress * 100);
          // Only log every 10% to avoid spam
          if (currentProgress >= loadProgress + 10) {
            console.log(`   Progress: ${currentProgress}%`);
            loadProgress = currentProgress;
          }
        },
      },
    });

    if (!model) {
      throw new Error('No model was loaded from IFC file');
    }

    // Export to Fragments file
    console.log('   Exporting to Fragments file...');
    const fragmentsBuffer = fragments.export(model);
    fs.writeFileSync(outputPath, fragmentsBuffer);

    // Count total elements
    let elementCount = 0;
    for (const fragment of model.items) {
      elementCount += fragment.capacity;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMB = (fragmentsBuffer.byteLength / 1024 / 1024).toFixed(2);

    console.log(`✅ Fragments saved: ${outputPath}`);
    console.log(`   Elements: ${elementCount}`);
    console.log(`   Size: ${sizeMB} MB`);
    console.log(`   Duration: ${duration}s`);

    // Cleanup
    components.dispose();

    return {
      outputPath,
      elementCount,
      sizeMB: parseFloat(sizeMB),
      duration: parseFloat(duration),
    };
  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    throw error;
  }
}

// Main execution
(async () => {
  // Get command-line arguments
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Usage: node convert-to-fragments.mjs <input.ifc> <output.frag>');
    console.error('');
    console.error('Example:');
    console.error('  node convert-to-fragments.mjs model.ifc model.frag');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;

  try {
    await convertToFragments(inputPath, outputPath);
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('Error details:', error);
    process.exit(1);
  }
})();
