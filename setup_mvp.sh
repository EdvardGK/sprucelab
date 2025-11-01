#!/bin/bash

# 🚨 EMERGENCY VIEWER - QUICK INSTALL SCRIPT
# This gets your IFC viewer working in 5 minutes

echo "🚨 EMERGENCY VIEWER SETUP"
echo "========================="
echo ""

# Navigate to frontend
cd "$(dirname "$0")/frontend" || exit 1

echo "📦 Installing ThatOpen components..."
npm install @thatopen/components

echo ""
echo "✅ Installation complete!"
echo ""
echo "🚀 Next steps:"
echo "1. Start dev server: npm run dev"
echo "2. Open browser: http://localhost:5173/emergency-viewer"
echo "3. Upload an IFC file"
echo ""
echo "📖 Full instructions: ../EMERGENCY_VIEWER_SETUP.md"
