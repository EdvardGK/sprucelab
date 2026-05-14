#!/usr/bin/env node
/**
 * IFC → Fragments converter (v3 format).
 *
 * Replaces the old `OBC.FragmentsManager.export(model)` pipeline with the
 * new `@thatopen/fragments` v3 `IfcImporter`. The output binary is the
 * compact v3 fragments format that the new `FragmentsModels` worker-based
 * loader on the frontend can stream + LOD on its own.
 *
 * Usage:
 *   node convert-to-fragments.mjs input.ifc output.frag
 *
 * Output:
 *   - `output.frag` written to disk
 *   - JSON line on stdout summarising the result, parsed by FastAPI's
 *     `api/fragments.py` subprocess wrapper
 *
 * Format: stdout JSON now includes `fragments_format_version: 'v3'` so
 * the backend can stamp Model.fragments_format_version on completion.
 *
 * Migration note: this is a breaking change to the on-disk binary
 * format. All existing v2 `.frag` files must be regenerated through this
 * converter before the frontend can load them via FragmentsModels. The
 * frontend keeps the old `OBC.FragmentsManager` path alive for v2 files
 * during the rollout (Phase B); once backfill completes (Phase D) the v2
 * branch is dropped.
 */

import * as FRAGS from '@thatopen/fragments';
import {
  IFCOPENINGELEMENT,
  IFCOPENINGSTANDARDCASE,
  IFCVIRTUALELEMENT,
} from 'web-ifc';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Non-physical IFC classes excluded from fragments at conversion time.
// IfcOpeningElement / IfcOpeningStandardCase are box volumes used to cut
// voids in walls/slabs at window+door locations; IfcVirtualElement is a
// synthetic placeholder. Rendering them produces "ghost glass panes"
// scattered through the fabric. Mirrors the Python canonical list in
// backend/apps/entities/services/verification_engine.py:534-541
// (_NON_PHYSICAL_IFC_CLASSES) — kept in sync so backend orphan accounting
// and the on-disk .frag binary agree on what counts as physical fabric.
//
// Wall cutouts are NOT affected: web-ifc applies IfcRelVoidsElement during
// the host wall's own geometry pass, so removing the opening from the
// import allow-list drops only the separate opening mesh, not the void.
const NON_PHYSICAL_IFC_CLASS_CODES = [
  IFCOPENINGELEMENT,
  IFCOPENINGSTANDARDCASE,
  IFCVIRTUALELEMENT,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertToFragments(inputPath, outputPath) {
  console.log(`Converting ${inputPath} to Fragments (v3)...`);
  console.log(`   Output: ${outputPath}`);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const startTime = Date.now();

  // IfcImporter pulls web-ifc WASM from the same node_modules layout the
  // old IfcLoader used.
  const importer = new FRAGS.IfcImporter();
  importer.wasm = {
    path: path.join(__dirname, 'node_modules', 'web-ifc') + '/',
    absolute: true,
  };

  // Strip non-physical classes from the importer's allow-list BEFORE
  // process() runs so their geometry never ships in the .frag binary.
  // See NON_PHYSICAL_IFC_CLASS_CODES above for rationale + Python parity.
  for (const code of NON_PHYSICAL_IFC_CLASS_CODES) {
    importer.classes.elements.delete(code);
  }

  console.log('   Loading IFC + serialising to v3 fragments...');
  const ifcBytes = fs.readFileSync(inputPath);
  // process() returns a Uint8Array; raw=false gives the compressed
  // production payload (smaller; what FragmentsModels expects).
  const fragmentsBytes = await importer.process({ bytes: new Uint8Array(ifcBytes) });

  fs.writeFileSync(outputPath, fragmentsBytes);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const sizeMB = (fragmentsBytes.byteLength / 1024 / 1024).toFixed(2);

  console.log(`Fragments saved: ${outputPath}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Duration: ${duration}s`);

  // Result line consumed by the FastAPI subprocess wrapper.
  console.log(JSON.stringify({
    success: true,
    outputPath,
    sizeMB: parseFloat(sizeMB),
    duration: parseFloat(duration),
    fragments_format_version: 'v3',
  }));

  return {
    outputPath,
    sizeMB: parseFloat(sizeMB),
    duration: parseFloat(duration),
  };
}

// Main execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node convert-to-fragments.mjs <input.ifc> <output.frag>');
    process.exit(1);
  }
  const [inputPath, outputPath] = args;
  try {
    await convertToFragments(inputPath, outputPath);
    process.exit(0);
  } catch (error) {
    console.error('Conversion failed:', error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message,
    }));
    console.error('Error details:', error);
    process.exit(1);
  }
})();
