-- Clear Geometry Data from Database
-- Run this script to remove all geometry data and prepare for IFC.js client-side rendering
--
-- Usage (PostgreSQL):
--   psql -h db.mwcjhbvzhnzslnatglcg.supabase.co -p 5432 -U postgres.mwcjhbvzhnzslnatglcg -d postgres < clear_geometry_data.sql
--
-- Or via Supabase Dashboard:
--   1. Go to: https://supabase.com/dashboard/project/mwcjhbvzhnzslnatglcg/sql
--   2. Paste this script and click "Run"

BEGIN;

-- Show current state
SELECT 'Current State:' AS info;
SELECT
    'Geometry Records' AS table_name,
    COUNT(*) AS count
FROM entities_geometry
UNION ALL
SELECT
    'Entities with Geometry' AS table_name,
    COUNT(*) AS count
FROM entities_ifcentity
WHERE has_geometry = true
UNION ALL
SELECT
    'Models with Geometry Completed' AS table_name,
    COUNT(*) AS count
FROM models_model
WHERE geometry_status IN ('completed', 'partial');

-- Confirm before proceeding
\echo ''
\echo '⚠️  WARNING: This will delete all geometry data!'
\echo 'Press Ctrl+C to cancel, or any key to continue...'
\prompt 'Type YES to confirm: ' confirm

-- Delete geometry data
DELETE FROM entities_geometry;

-- Update entity records
UPDATE entities_ifcentity
SET
    has_geometry = false,
    geometry_status = 'pending'
WHERE has_geometry = true;

-- Update model records
UPDATE models_model
SET geometry_status = 'pending'
WHERE geometry_status IN ('completed', 'partial');

-- Show final state
SELECT 'Final State:' AS info;
SELECT
    'Geometry Records' AS table_name,
    COUNT(*) AS count
FROM entities_geometry
UNION ALL
SELECT
    'Entities with Geometry' AS table_name,
    COUNT(*) AS count
FROM entities_ifcentity
WHERE has_geometry = true
UNION ALL
SELECT
    'Models with Geometry Completed' AS table_name,
    COUNT(*) AS count
FROM models_model
WHERE geometry_status IN ('completed', 'partial');

COMMIT;

-- Summary
\echo ''
\echo '✅ Geometry data cleared successfully!'
\echo ''
\echo 'Next steps:'
\echo '1. Frontend will now download IFC files directly from Supabase Storage'
\echo '2. IFC.js will render geometry in browser (1-2 seconds vs 2-5 minutes)'
\echo '3. New uploads will skip geometry processing (metadata only)'
