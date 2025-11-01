-- Clear Geometry Data - Simple Version
-- Run via Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/mwcjhbvzhnzslnatglcg/sql

-- Show current state
SELECT
    'Geometry Records' AS description,
    COUNT(*) AS count
FROM entities_geometry
UNION ALL
SELECT
    'Entities with has_geometry=true',
    COUNT(*)
FROM entities_ifcentity
WHERE has_geometry = true
UNION ALL
SELECT
    'Models with geometry_status completed/partial',
    COUNT(*)
FROM models_model
WHERE geometry_status IN ('completed', 'partial');

-- ============================================================================
-- DELETE GEOMETRY DATA (Uncomment to execute)
-- ============================================================================

-- Step 1: Delete all geometry records
-- DELETE FROM entities_geometry;

-- Step 2: Update entity records
-- UPDATE entities_ifcentity
-- SET
--     has_geometry = false,
--     geometry_status = 'pending'
-- WHERE has_geometry = true;

-- Step 3: Update model records
-- UPDATE models_model
-- SET geometry_status = 'pending'
-- WHERE geometry_status IN ('completed', 'partial');

-- ============================================================================
-- INSTRUCTIONS:
-- 1. Run this script AS-IS to see current counts
-- 2. Uncomment the DELETE/UPDATE statements above
-- 3. Run again to perform cleanup
-- ============================================================================
