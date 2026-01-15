-- Fix IFCModel file_url to point to Supabase Storage instead of Django media
-- Run this in Supabase Dashboard → SQL Editor

-- First, preview what will be changed
SELECT
    id,
    name,
    file_url as old_url,
    REPLACE(
        REPLACE(file_url,
            'https://sprucelab-production.up.railway.app/media/ifc_files/',
            'https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/'
        ),
        'https://sprucelab-production.up.railway.app/media/',
        'https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/'
    ) as new_url
FROM models_model
WHERE file_url LIKE '%sprucelab-production.up.railway.app/media%';

-- Uncomment below to actually update (after verifying the preview looks correct)
/*
UPDATE models_model
SET file_url = REPLACE(
    REPLACE(file_url,
        'https://sprucelab-production.up.railway.app/media/ifc_files/',
        'https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/'
    ),
    'https://sprucelab-production.up.railway.app/media/',
    'https://rtrgoqpsdmhhcmgietle.supabase.co/storage/v1/object/public/ifc-files/'
)
WHERE file_url LIKE '%sprucelab-production.up.railway.app/media%';
*/
