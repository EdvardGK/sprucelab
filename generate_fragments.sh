#!/bin/bash
# Generate Fragments for IFC models
# Run from project root: ./generate_fragments.sh

set -e

# Model to process (S8A_ARK_MMI900)
IFC_URL="https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/ifc_files/2332d095-43c4-4ade-8dd0-ad23131327f1/S8A_ARK_MMI900.ifc"
MODEL_ID="d4641ab1-7c8a-4472-8f94-5b88c12559fc"
OUTPUT_DIR="./tmp_fragments"

echo "📥 Downloading IFC file..."
mkdir -p "$OUTPUT_DIR"
curl -o "$OUTPUT_DIR/model.ifc" "$IFC_URL"

echo "🔧 Converting to Fragments..."
cd frontend
node scripts/convert-to-fragments.mjs "../$OUTPUT_DIR/model.ifc" "../$OUTPUT_DIR/model.frag"
cd ..

echo "📤 Upload $OUTPUT_DIR/model.frag to Supabase Storage:"
echo "   Bucket: ifc-files"
echo "   Path: models/$MODEL_ID/model.frag"
echo ""
echo "Then update database:"
echo "   UPDATE models SET fragments_url = 'https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/models/$MODEL_ID/model.frag' WHERE id = '$MODEL_ID';"
