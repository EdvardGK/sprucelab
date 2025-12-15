# Session 002 Planning: BIM Coordinator Platform

**Date**: 2025-10-11
**Status**: Planning Phase
**Goal**: Design and implement a full-scale BIM management platform

## Project Evolution

This project has evolved from a simple mesh extraction tool to a comprehensive BIM coordinator platform:

**Original Scope (Session 001)**:
- Extract 3D mesh geometry from IFC files
- Simplify geometry for web visualization
- Recreate simplified IFC files

**New Scope (Session 002)**:
- Full BIM management platform with graph database
- Multi-model project management
- Automated change detection between versions
- Interactive graph visualization
- Query interface for BIM data
- 3D geometry viewer
- Dashboard UI for BIM coordinators/managers

## Architecture Overview

### Tech Stack

**Backend**:
- Django 5.0 + Django REST Framework
- Celery + Redis (async task processing)
- ifcopenshell (IFC parsing)
- Open3D (geometry processing)

**Database & Storage**:
- Supabase (PostgreSQL) - metadata, relationships, properties
- Supabase Storage - IFC files, geometry files
- Graph edges stored in PostgreSQL

**Frontend**:
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Tanstack Query (React Query) - data fetching
- Three.js + @react-three/fiber - 3D viewer
- react-force-graph-3d or Cytoscape.js - graph visualization

**Processing**:
- Background jobs via Celery
- IFC ingestion pipeline
- Geometry simplification
- Change detection algorithms

## Database Schema Design

### Core Tables

**projects** - Top-level organization
- id, name, description, created_at, updated_at

**models** - IFC file versions
- id, project_id, name, filename, ifc_schema, file_url
- status (uploading/processing/ready/error)
- version_number, parent_model_id (for versioning)
- element_count, storey_count, system_count

**ifc_entities** - All building elements
- id, model_id, ifc_guid, ifc_type, name, description
- storey_id (reference to parent storey)
- UNIQUE(model_id, ifc_guid)

**spatial_hierarchy** - Project/Site/Building/Storey structure
- id, model_id, entity_id, parent_id
- hierarchy_level, path (array of GUIDs)

**property_sets** - Psets and properties
- id, entity_id, pset_name, property_name
- property_value, property_type
- Indexed on pset_name and property_name

**systems** - HVAC, Electrical, Plumbing, etc.
- id, model_id, system_guid, system_name, system_type

**system_memberships** - Elements in systems
- system_id, entity_id

**materials** - Material library
- id, model_id, material_name, category

**material_assignments** - Elements with materials
- entity_id, material_id, layer_thickness

**ifc_types** - Type objects (WallType, DoorType, etc.)
- id, model_id, type_guid, type_name, ifc_type
- properties (JSONB)

**type_assignments** - Elements with types
- entity_id, type_id

**geometry** - Simplified mesh data
- entity_id (PK), vertices (BYTEA), faces (BYTEA)
- vertex_count, triangle_count, bounding_box (JSONB)

**graph_edges** - Relationships for visualization
- id, model_id, source_entity_id, target_entity_id
- relationship_type, properties (JSONB)

**change_log** - Version comparison results
- id, model_id, previous_model_id, ifc_guid
- change_type (added/deleted/modified/geometry_changed/property_changed)
- change_details (JSONB), detected_at

**storage_metrics** - File size breakdown
- model_id, measured_at
- spatial_structure_bytes, elements_metadata_bytes
- properties_bytes, systems_bytes, materials_bytes
- relationships_bytes, geometry_original_bytes, geometry_simplified_bytes

## Key Features

### 1. Multi-Model Management
- Upload IFC files to projects
- Automatic versioning (v1, v2, v3...)
- Track multiple models per project
- View model metadata and statistics

### 2. Graph Database & Visualization
- IFC hierarchy as interactive node graph
- Nodes: Elements, Systems, Types, Materials
- Edges: Relationships (contains, aggregates, defines, assigns)
- Color-coded by IFC type
- Clickable nodes show properties
- Filter by type, storey, system
- Search by name/GUID

### 3. Change Detection System
**GUID-based tracking**:
- Compare model versions automatically
- Detect: New GUIDs, Deleted GUIDs, Modified elements
- Track property changes
- Track geometry changes
- Generate change reports

**Change types**:
- `added` - New elements in current version
- `deleted` - Elements removed from previous version
- `modified` - Elements with property/geometry changes
- `geometry_changed` - Mesh vertices/faces differ
- `property_changed` - Pset values differ

### 4. Dashboard Views

**Global Dashboard** (`/dashboard`)
- Grid of all projects
- Project cards with: model count, latest version, recent changes
- Quick stats: total elements, total models
- Search/filter projects

**Project View** (`/projects/{id}`)
- List of all models in project
- Version timeline
- Change history graph
- Upload new version button

**Model View** (`/models/{id}`)
- Tabbed interface:
  - **Overview**: Stats, metadata, processing status
  - **Graph**: Interactive force-directed graph
  - **3D Viewer**: Three.js mesh viewer
  - **Properties**: Searchable property table
  - **Systems**: System breakdown
  - **Query**: Custom query builder
- Side panel: Entity details, property sets

**Comparison View** (`/compare?from={id}&to={id}`)
- Side-by-side model comparison
- Change statistics
- Added elements (green)
- Removed elements (red)
- Modified elements (yellow)
- Property diff table
- 3D diff viewer (highlight changes)

### 5. Query Interface

**Visual Query Builder**:
- Select IFC types (multi-select)
- Filter by storey
- Filter by system
- Property filters (FireRating = "120min")
- Geometry filters (triangle_count > 1000)
- Export results to CSV/JSON

**Graph Queries**:
- Find all elements in storey
- Find all elements in system
- Find all elements using material
- Find all instances of type
- Shortest path between elements

**SQL Query Panel**:
- Raw SQL interface for advanced users
- Pre-built query templates
- Save/load queries

### 6. 3D Viewer Features
- Load simplified geometry from database
- Color by: IFC type, storey, system, property value
- Select elements → show properties
- Camera controls (orbit, pan, zoom)
- Exploded view by storey
- Section box
- Measurement tools

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Backend**:
- Django project setup
- Supabase connection configuration
- Database schema implementation (migrations)
- Basic models: Project, Model, IFCEntity
- File upload to Supabase Storage
- Celery setup for background tasks

**IFC Processing**:
- Adapt `ifc_mesh_extractor.py` to extract to database
- Create `IFCDatabaseExtractor` class
- Extract: spatial structure, elements, properties, systems, materials, types
- Extract relationships for graph
- Store geometry in separate table

**API**:
- Projects CRUD endpoints
- Models CRUD endpoints
- File upload endpoint
- Basic entity list endpoint

**Frontend**:
- Vite + React + TypeScript setup
- Routing (React Router)
- Supabase client setup
- Basic layout with navigation

### Phase 2: Core Data Flow (Week 2-3)
**Backend**:
- Complete IFC extraction pipeline
- Celery task for IFC processing
- Processing status updates
- Graph edge generation
- Geometry simplification integration

**API**:
- Entity detail endpoint with properties
- Graph data endpoint (nodes + edges)
- Spatial hierarchy endpoint
- System list endpoint

**Frontend**:
- Dashboard page (project list)
- Project detail page (model list)
- Model upload component with progress
- Processing status indicator

### Phase 3: Visualization (Week 3-4)
**Frontend**:
- Model detail page layout
- 3D viewer integration (Three.js)
  - Load geometry from API
  - Render meshes
  - Basic camera controls
  - Element selection
- Graph viewer integration (react-force-graph-3d)
  - Render nodes and edges
  - Color by IFC type
  - Node click → show properties
- Property panel component
- Element table with search/filter

### Phase 4: Change Detection (Week 4-5)
**Backend**:
- Change detection service
- GUID comparison logic
- Property diff algorithm
- Geometry change detection
- Change log generation
- Automatic change detection on model upload

**API**:
- Compare models endpoint
- Change log endpoints
- Change timeline endpoint

**Frontend**:
- Version comparison page
- Change timeline component
- Change statistics cards
- Added/removed/modified lists
- Property diff table
- 3D diff viewer (highlight changes)

### Phase 5: Query System (Week 5-6)
**Backend**:
- Query builder service
- Dynamic SQL generation
- Graph traversal queries
- Query result serialization
- Export to CSV/JSON

**API**:
- Query endpoints (entities, graph, systems)
- Export endpoints

**Frontend**:
- Query builder UI
- Filter components (type, storey, properties)
- Results table
- Result export buttons
- Graph query interface
- Saved queries

### Phase 6: Polish & Production (Week 6-8)
**Backend**:
- Performance optimization (database indexes, query optimization)
- Caching (Redis)
- Error handling and logging
- API documentation (Swagger/OpenAPI)
- Background job monitoring

**Frontend**:
- Loading states and skeletons
- Error boundaries
- Toast notifications
- Responsive design (mobile support)
- Dark mode
- Keyboard shortcuts
- User preferences

**DevOps**:
- Docker setup
- Environment configuration
- Deployment pipeline
- Monitoring and logging
- Backup strategy

**Documentation**:
- API documentation
- User guide
- Developer documentation
- Deployment guide

## Technical Decisions

### Why Django?
- Mature ORM for complex relationships
- Django REST Framework for API
- Celery integration for background jobs
- Strong PostgreSQL support
- Admin panel for debugging

### Why Supabase?
- PostgreSQL with built-in APIs
- File storage included
- Real-time subscriptions (for live updates)
- Auth system ready
- Good TypeScript support

### Why React (not Next.js)?
- This is a dashboard app, not a content site (no SEO needed)
- Better control over client-side routing
- Simpler deployment (SPA)
- Faster development for interactive UIs

### Graph Storage Approach
- Store edges in PostgreSQL (not separate graph DB)
- Simpler architecture, fewer dependencies
- PostgreSQL handles graph queries well for our scale
- Can migrate to Neo4j later if needed

### Geometry Storage
- Simplified geometry in database (BYTEA, compressed)
- Original IFC files in Supabase Storage
- On-demand geometry extraction
- LOD (Level of Detail) system for large models

## Success Criteria

### MVP (Minimum Viable Product)
- ✅ Upload IFC files
- ✅ Extract to database (spatial structure, properties, systems)
- ✅ View model as graph
- ✅ View model in 3D
- ✅ Search/filter elements
- ✅ Compare two model versions
- ✅ Show added/removed/modified elements

### Full Release
- ✅ Multi-project management
- ✅ Visual query builder
- ✅ Property editing
- ✅ Export capabilities
- ✅ User authentication
- ✅ Role-based permissions
- ✅ Change notifications
- ✅ API for integrations

## Performance Targets

- Model upload: < 10s for 50MB IFC
- Processing: < 5min for 10,000 element model
- Graph rendering: < 2s for 5,000 nodes
- 3D viewer: 60fps for simplified geometry
- Query response: < 500ms for filtered element list
- Change detection: < 2min for 10,000 element comparison

## File Size Measurement Goals

Track and display breakdown:
- IFC file size (original)
- Spatial structure: X KB
- Property sets: X MB
- Systems & relationships: X KB
- Materials & types: X MB
- Geometry (original): X MB
- Geometry (simplified): X MB
- **Total reduction: X%**

## Future Enhancements

**Phase 2 Features**:
- BCF (BIM Collaboration Format) integration
- Issue tracking linked to elements
- Clash detection
- Quantity takeoffs
- 4D scheduling (link to timeline)
- Cost data integration
- PDF report generation
- Email notifications
- Webhook integrations
- Mobile app (React Native)

**Advanced Analytics**:
- Element heatmaps (by property value)
- System flow diagrams
- Material usage charts
- Change velocity metrics
- Model complexity scores

## Risk Mitigation

**Large File Handling**:
- Risk: 500MB+ IFC files crash browser
- Mitigation: Server-side processing, streaming, LOD system

**Performance**:
- Risk: Graph rendering too slow for 10,000+ nodes
- Mitigation: Clustering, filtering, pagination, WebGL rendering

**Data Consistency**:
- Risk: IFC extraction fails mid-process
- Mitigation: Database transactions, rollback on error, retry logic

**User Experience**:
- Risk: Complex interface confuses users
- Mitigation: User testing, tooltips, onboarding tour, help documentation

## Related Files

- Session 001 implementation: `session-001-mesh-extractor.md`
- Existing scripts to adapt:
  - `ifc_mesh_extractor.py` → database extraction
  - `simplify_and_recreate_ifc.py` → geometry processing
  - `json_to_ifc.py` → IFC recreation

## Next Steps

1. Create project structure for Django backend
2. Initialize Supabase project and get credentials
3. Set up React frontend with Vite
4. Implement database schema
5. Adapt IFC extraction to write to database
6. Build basic upload → process → view pipeline
7. Implement graph visualization
8. Build change detection system

---

**Last Updated**: 2025-10-11
**Status**: Ready to implement Phase 1
