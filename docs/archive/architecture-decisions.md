# Key Architecture Decisions (Historical)

Archived from CLAUDE.md on 2026-04-24. These were early decisions, some superseded by types-only architecture.

## Database Storage Over Files
- Store ALL IFC data in PostgreSQL, not just geometry
- Enables SQL queries, change detection, selective reconstruction

## GUID-Based Change Detection
- Track changes by comparing IFC GlobalId between versions
- Change types: added, removed, modified, geometry_changed, property_changed

## Graph Storage in PostgreSQL
- Store relationships as edges in `graph_edges` table
- PostgreSQL handles graph queries well for our scale
- Note: graph app was archived in simplification sprint (2026-04)

## React SPA (Not Next.js)
- Client-side React app (no server-rendering needed)
- Dashboard app (no SEO needed)
- Better for interactive UIs
