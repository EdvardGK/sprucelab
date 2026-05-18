# Data migration: enable Row Level Security on every table in the
# `public` schema. Supabase's advisor flagged the schema as exposed via
# PostgREST (anon + authenticated JWT roles can hit /rest/v1/<table>)
# without any RLS in place — a high-severity finding because sensitive
# columns (email, password hashes, session tokens) become readable.
#
# Sprucelab's frontend uses the Supabase client ONLY for auth (session
# refresh, JWT); it never calls supabase.from()/.rpc()/.storage. All
# data flows through Django on Railway, which connects as the table
# owner. Postgres' default RLS rule (without `FORCE ROW LEVEL SECURITY`)
# bypasses RLS for the table owner — so enabling RLS without policies
# is a hard deny for anon + authenticated, and a transparent no-op for
# Django.
#
# Idempotent: re-running the migration won't error if RLS is already on.
# Future tables added by later migrations need to be added to the loop
# below or covered by a follow-up enable_rls() pass at deploy time.

from django.db import migrations


def enable_rls_on_public(apps, schema_editor):
    """Enable RLS on every base table in `public`. Skips views, foreign
    tables, and Postgres-internal schemas. Idempotent."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            DO $$
            DECLARE
                r record;
            BEGIN
                FOR r IN
                    SELECT n.nspname AS schema_name,
                           c.relname AS table_name
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relkind = 'r'  -- ordinary tables only
                LOOP
                    EXECUTE format(
                        'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                        r.schema_name, r.table_name
                    );
                END LOOP;
            END
            $$;
            """
        )


def disable_rls_on_public(apps, schema_editor):
    """Reverse path — disable RLS. Provided for completeness; in
    practice rolling back this migration in production would re-open
    the security finding, so prefer adding more restrictive policies
    instead of running the reverse."""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            DO $$
            DECLARE
                r record;
            BEGIN
                FOR r IN
                    SELECT n.nspname AS schema_name,
                           c.relname AS table_name
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relkind = 'r'
                LOOP
                    EXECUTE format(
                        'ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY',
                        r.schema_name, r.table_name
                    );
                END LOOP;
            END
            $$;
            """
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_userprofile_approval_status_userprofile_approved_at_and_more"),
    ]

    operations = [
        migrations.RunPython(enable_rls_on_public, disable_rls_on_public),
    ]
