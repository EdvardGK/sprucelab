# Session 006 Planning: BIM Coordinator Model Workspace

**Date**: 2025-10-13
**Status**: Planning Complete, Implementation Starting
**Goal**: Transform model page from simple 3D viewer into comprehensive BIM coordinator workspace

---

## Strategic Vision

### Problem Statement
Current model page is a single 3D viewer - this is insufficient for BIM coordinators who need:
- Quality validation tools
- Business intelligence dashboards
- Script execution capabilities
- Automated workflows
- Comprehensive statistics

### Target Audience
- **PRIMARY**: BIM coordinators & BIM managers
- **NOT**: Modelers (they work in Revit/ArchiCAD/Rhino/Tekla)

### Key Differentiator from Competitors
Unlike Autodesk Construction Cloud, Dalux, BIM 360:
- ✅ Script execution on models (Python-based)
- ✅ Automated workflows (on-upload triggers, scheduled)
- ✅ Custom validation rules
- ✅ Business intelligence dashboards
- ✅ Quality control tooling built-in

**This platform is the "home base" for BIM coordinators.**

---

## Architecture Overview

### Model Workspace Structure

**Current State:**
```
/models/{id}
└── Single 3D viewer page
```

**New State:**
```
/models/{id}
├── Overview Tab (Dashboard)
├── 3D Viewer Tab
├── Validation Tab
├── Statistics Tab (BI)
├── Properties Tab
├── Scripts Tab (NEW)
├── Metadata Tab
└── History Tab
```

### Core Principles
1. **3D viewer is ONE tool among many** (not the whole page)
2. **Each model version has its own workspace**
3. **Validation, statistics, scripts are equally important**
4. **Automation is a first-class feature**
5. **Built for coordinators, not modelers**

---

## Database Schema (4 New Tables)

### 1. scripts

Script library for the platform.

**Fields:**
```sql
id                UUID PRIMARY KEY
name              VARCHAR(255) NOT NULL
description       TEXT
script_type       VARCHAR(50) NOT NULL  -- 'python', 'validation_rule', 'export'
code              TEXT NOT NULL         -- Script source code
parameters_schema JSON DEFAULT {}       -- Expected parameters (JSON Schema format)
category          VARCHAR(50)           -- 'validation', 'export', 'transform', 'analysis'
is_public         BOOLEAN DEFAULT true  -- Public vs. user-private
author_id         UUID FK users         -- Who created this script
created_at        TIMESTAMP
updated_at        TIMESTAMP

UNIQUE(name, author_id)  -- User can't have duplicate script names
INDEX(category)
INDEX(is_public)
```

**Example Scripts:**
- "Export Elements to CSV"
- "GUID Validation Check"
- "LOD Analyzer"
- "Property Coverage Report"
- "Volume Calculator"

### 2. script_executions

History of script runs.

**Fields:**
```sql
id              UUID PRIMARY KEY
script_id       UUID FK scripts NOT NULL
model_id        UUID FK models NOT NULL
status          VARCHAR(20) NOT NULL  -- 'queued', 'running', 'success', 'error'
parameters      JSON DEFAULT {}       -- Actual parameters used
started_at      TIMESTAMP
completed_at    TIMESTAMP
duration_ms     INTEGER               -- Execution time in milliseconds
output_log      TEXT                  -- stdout/stderr capture
result_data     JSON DEFAULT {}       -- Structured results (counts, statistics, etc.)
result_files    JSON DEFAULT []       -- Array of file URLs in storage
error_message   TEXT                  -- Error details if status='error'
executed_by_id  UUID FK users         -- Who triggered this

INDEX(script_id)
INDEX(model_id)
INDEX(status)
INDEX(started_at DESC)
```

**Execution Flow:**
1. User clicks "Execute" on script
2. Record created with status='queued'
3. Celery task starts → status='running'
4. Script executes, logs captured
5. Results saved to storage
6. status='success' or 'error'

### 3. automation_workflows

Scheduled/triggered workflows.

**Fields:**
```sql
id                UUID PRIMARY KEY
name              VARCHAR(255) NOT NULL
description       TEXT
trigger_type      VARCHAR(50) NOT NULL  -- 'on_upload', 'scheduled', 'manual'
trigger_config    JSON DEFAULT {}       -- Cron schedule, conditions, etc.
script_id         UUID FK scripts NOT NULL
default_parameters JSON DEFAULT {}      -- Parameters to pass to script
is_active         BOOLEAN DEFAULT true
project_id        UUID FK projects NULL -- Scope: specific project or global
last_run_at       TIMESTAMP
next_run_at       TIMESTAMP             -- For scheduled workflows
created_at        TIMESTAMP
updated_at        TIMESTAMP

INDEX(trigger_type)
INDEX(is_active)
INDEX(project_id)
INDEX(next_run_at)
```

**Example Workflows:**
- "Auto-validate all uploaded models" (trigger_type='on_upload')
- "Weekly property coverage report" (trigger_type='scheduled', cron='0 0 * * MON')
- "Generate LOD summary on demand" (trigger_type='manual')

### 4. workflow_executions

History of workflow runs.

**Fields:**
```sql
id                  UUID PRIMARY KEY
workflow_id         UUID FK automation_workflows NOT NULL
model_id            UUID FK models NULL           -- Model that triggered this
script_execution_id UUID FK script_executions NULL -- Link to actual script run
status              VARCHAR(20) NOT NULL          -- 'success', 'error', 'skipped'
triggered_by        VARCHAR(50)                   -- 'upload', 'schedule', 'manual'
triggered_by_user_id UUID FK users NULL           -- If manual trigger
error_message       TEXT
executed_at         TIMESTAMP

INDEX(workflow_id)
INDEX(model_id)
INDEX(executed_at DESC)
```

**Relationship:**
- WorkflowExecution → ScriptExecution (many-to-one)
- One workflow run creates one script execution

---

## Backend Implementation

### App Structure

**New Django App: `apps/scripts/`**
```
apps/scripts/
├── models.py          # Script, ScriptExecution, AutomationWorkflow, WorkflowExecution
├── serializers.py     # DRF serializers
├── views.py           # API endpoints
├── urls.py            # URL routing
├── services/
│   ├── runner.py      # Script execution engine
│   ├── context.py     # Build script context (model data access)
│   ├── sandbox.py     # Sandboxed execution (subprocess)
│   └── workflows.py   # Workflow trigger system
├── migrations/
│   └── 0001_initial.py
└── admin.py           # Django admin
```

### Script Execution Engine

**Script Runner Service** (`services/runner.py`)

**Core Function:**
```python
def execute_script(script_id: UUID, model_id: UUID, parameters: dict) -> ScriptExecution:
    """
    Execute a script on a model.

    Steps:
    1. Create ScriptExecution record (status='queued')
    2. Build script context (model data, ifcopenshell, utilities)
    3. Execute script in subprocess with timeout
    4. Capture stdout/stderr
    5. Save result files to Supabase Storage
    6. Update ScriptExecution (status='success' or 'error')

    Returns:
        ScriptExecution object with results
    """
```

**Script Context** (What scripts can access):
```python
context = {
    # Model data
    'model': model,
    'entities': model.entities.all(),
    'properties': PropertySet.objects.filter(entity__model=model),
    'systems': model.systems.all(),
    'materials': model.materials.all(),
    'types': model.types.all(),

    # Helper functions
    'get_geometry': lambda entity_id: load_geometry_from_db(entity_id),
    'get_properties': lambda entity_id: get_entity_properties(entity_id),
    'save_output': lambda filename, data: save_to_storage(filename, data),

    # Libraries
    'ifcopenshell': ifcopenshell,
    'numpy': np,
    'pandas': pd,

    # Parameters from user
    'params': parameters,
}
```

**Execution Process:**
```python
# 1. Create execution record
execution = ScriptExecution.objects.create(
    script=script,
    model=model,
    parameters=parameters,
    status='queued'
)

# 2. Build context
context = build_script_context(model, parameters)

# 3. Execute in subprocess (sandboxed)
try:
    execution.status = 'running'
    execution.started_at = timezone.now()
    execution.save()

    result = run_script_in_subprocess(
        code=script.code,
        context=context,
        timeout=300  # 5 minutes
    )

    execution.status = 'success'
    execution.output_log = result['stdout']
    execution.result_data = result['data']
    execution.result_files = result['files']

except Exception as e:
    execution.status = 'error'
    execution.error_message = str(e)

finally:
    execution.completed_at = timezone.now()
    execution.duration_ms = (execution.completed_at - execution.started_at).total_seconds() * 1000
    execution.save()
```

**Sandboxing Strategy:**
- Run scripts in subprocess with timeout
- Limit available libraries (whitelist ifcopenshell, numpy, pandas)
- No file system access (except via save_output function)
- No network access
- Memory limit (optional, via Docker container)

### Built-in Scripts

**1. Export Elements to CSV**
```python
# Extract entities with selected properties
import csv
entities = context['entities']
properties = context['get_properties']

rows = []
for entity in entities:
    props = properties(entity.id)
    rows.append({
        'GUID': entity.ifc_guid,
        'Type': entity.ifc_type,
        'Name': entity.name,
        'Storey': entity.storey_id,
        **{p.property_name: p.property_value for p in props}
    })

# Save as CSV
context['save_output']('elements.csv', rows)
```

**2. GUID Validation Check**
```python
# Check for duplicate GUIDs, invalid format
import re
entities = context['entities']

duplicates = []
invalid_format = []
guid_counts = {}

for entity in entities:
    guid = entity.ifc_guid

    # Check format (22 chars, base64 encoding)
    if not re.match(r'^[0-9A-Za-z_$]{22}$', guid):
        invalid_format.append(guid)

    # Count duplicates
    guid_counts[guid] = guid_counts.get(guid, 0) + 1

duplicates = [guid for guid, count in guid_counts.items() if count > 1]

result = {
    'total_elements': len(entities),
    'duplicate_guids': len(duplicates),
    'invalid_format': len(invalid_format),
    'duplicates_list': duplicates,
    'invalid_list': invalid_format,
}

return result
```

**3. LOD Analyzer**
```python
# Analyze Level of Development by element type
entities = context['entities']
types = {}

for entity in entities:
    ifc_type = entity.ifc_type
    has_geometry = entity.has_geometry
    props_count = len(context['get_properties'](entity.id))

    if ifc_type not in types:
        types[ifc_type] = {
            'count': 0,
            'with_geometry': 0,
            'avg_properties': 0,
            'total_properties': 0,
        }

    types[ifc_type]['count'] += 1
    if has_geometry:
        types[ifc_type]['with_geometry'] += 1
    types[ifc_type]['total_properties'] += props_count

# Calculate LOD score (0-300)
for ifc_type, data in types.items():
    geometry_ratio = data['with_geometry'] / data['count']
    avg_props = data['total_properties'] / data['count']

    lod_score = int(geometry_ratio * 150 + min(avg_props / 10, 1) * 150)
    types[ifc_type]['lod_score'] = lod_score
    types[ifc_type]['lod_level'] = 'LOD 100' if lod_score < 100 else 'LOD 200' if lod_score < 200 else 'LOD 300'

return types
```

### API Endpoints

**Scripts Management:**
```python
# GET /api/scripts/
# List all public scripts + user's private scripts
class ScriptViewSet(viewsets.ModelViewSet):
    queryset = Script.objects.all()
    serializer_class = ScriptSerializer

    def get_queryset(self):
        return Script.objects.filter(
            Q(is_public=True) | Q(author=self.request.user)
        )

# POST /api/scripts/
# Create new script (user becomes author)

# GET /api/scripts/{id}/
# Script details

# PATCH /api/scripts/{id}/
# Update script (only author can edit)

# DELETE /api/scripts/{id}/
# Delete script (only author can delete)
```

**Script Execution:**
```python
# POST /api/models/{id}/execute-script/
# Execute script on model
@action(detail=True, methods=['post'])
def execute_script(self, request, pk=None):
    model = self.get_object()
    script_id = request.data.get('script_id')
    parameters = request.data.get('parameters', {})

    # Create execution record
    execution = ScriptExecution.objects.create(
        script_id=script_id,
        model=model,
        parameters=parameters,
        status='queued'
    )

    # Queue Celery task (async)
    run_script_task.delay(execution.id)

    return Response({
        'execution_id': execution.id,
        'status': execution.status
    })

# GET /api/models/{id}/script-executions/
# List execution history for this model

# GET /api/script-executions/{id}/
# Execution details (status, logs, results)

# GET /api/script-executions/{id}/download/{filename}
# Download result file from storage
```

**Workflows:**
```python
# GET /api/workflows/
# List all workflows

# POST /api/workflows/
# Create workflow

# GET /api/workflows/{id}/
# Workflow details

# PATCH /api/workflows/{id}/
# Update workflow

# POST /api/workflows/{id}/activate/
# Enable workflow

# POST /api/workflows/{id}/deactivate/
# Disable workflow

# POST /api/workflows/{id}/execute/
# Manually trigger workflow (for trigger_type='manual')
```

---

## Frontend Implementation

### Model Workspace Component

**ModelWorkspace.tsx** (Main container)
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function ModelWorkspace({ modelId }: { modelId: string }) {
  const { data: model } = useModel(modelId);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <ModelHeader model={model} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1">
        <div className="border-b">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="viewer">3D Viewer</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="scripts">Scripts</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview"><OverviewTab model={model} /></TabsContent>
        <TabsContent value="viewer"><Viewer3DTab model={model} /></TabsContent>
        <TabsContent value="validation"><ValidationTab model={model} /></TabsContent>
        <TabsContent value="statistics"><StatisticsTab model={model} /></TabsContent>
        <TabsContent value="properties"><PropertiesTab model={model} /></TabsContent>
        <TabsContent value="scripts"><ScriptsTab model={model} /></TabsContent>
        <TabsContent value="metadata"><MetadataTab model={model} /></TabsContent>
        <TabsContent value="history"><HistoryTab model={model} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

### Overview Tab (Model Dashboard)

**OverviewTab.tsx**
```tsx
export function OverviewTab({ model }: { model: Model }) {
  const { data: validation } = useValidationReport(model.id);
  const { data: stats } = useModelStatistics(model.id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{model.name}</CardTitle>
              <p className="text-sm text-text-secondary">
                Version {model.version_number} • {model.ifc_schema} • Updated {formatDate(model.updated_at)}
              </p>
            </div>
            <Badge variant={model.status === 'ready' ? 'success' : 'warning'}>
              {model.status}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Validation Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Validation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <ValidationStatusBadge status={validation.overall_status} />
            <div className="text-sm text-text-secondary">
              {validation.elements_with_issues} issues found in {validation.total_elements} elements
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Elements" value={stats.element_count} />
        <StatCard title="Storeys" value={stats.storey_count} />
        <StatCard title="Systems" value={stats.system_count} />
        <StatCard title="File Size" value={formatFileSize(model.file_size)} />
      </div>

      {/* Element Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Element Types</CardTitle>
        </CardHeader>
        <CardContent>
          <ElementTypeChart data={stats.elements_by_type} />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button>Download IFC</Button>
        <Button variant="outline">Compare Versions</Button>
        <Button variant="outline">Run Validation</Button>
        <Button variant="outline">Execute Script</Button>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed modelId={model.id} />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Validation Tab

**ValidationTab.tsx**
```tsx
export function ValidationTab({ model }: { model: Model }) {
  const { data: report, refetch } = useValidationReport(model.id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Validation Report</h2>
          <p className="text-sm text-text-secondary">
            Last validated: {formatDate(report.validated_at)}
          </p>
        </div>
        <Button onClick={() => refetch()}>Re-run Validation</Button>
      </div>

      {/* Overall Status */}
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <ValidationStatusBadge
              status={report.overall_status}
              size="large"
            />
            <p className="mt-4 text-text-secondary">
              {report.summary}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Issue Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <IssueCard
          title="Schema Errors"
          count={report.schema_errors.length}
          severity="error"
        />
        <IssueCard
          title="GUID Issues"
          count={report.guid_issues.length}
          severity="warning"
        />
        <IssueCard
          title="Geometry Issues"
          count={report.geometry_issues.length}
          severity="info"
        />
      </div>

      {/* Detailed Issues */}
      <Accordion type="multiple">
        <AccordionItem value="schema">
          <AccordionTrigger>Schema Errors ({report.schema_errors.length})</AccordionTrigger>
          <AccordionContent>
            <IssueList issues={report.schema_errors} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="guid">
          <AccordionTrigger>GUID Issues ({report.guid_issues.length})</AccordionTrigger>
          <AccordionContent>
            <IssueList issues={report.guid_issues} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="geometry">
          <AccordionTrigger>Geometry Issues ({report.geometry_issues.length})</AccordionTrigger>
          <AccordionContent>
            <IssueList issues={report.geometry_issues} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="properties">
          <AccordionTrigger>Property Issues ({report.property_issues.length})</AccordionTrigger>
          <AccordionContent>
            <IssueList issues={report.property_issues} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="lod">
          <AccordionTrigger>LOD Issues ({report.lod_issues.length})</AccordionTrigger>
          <AccordionContent>
            <IssueList issues={report.lod_issues} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
```

### Statistics Tab (BI Dashboard)

**StatisticsTab.tsx**
```tsx
import { PieChart, BarChart, Pie, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function StatisticsTab({ model }: { model: Model }) {
  const { data: stats } = useModelStatistics(model.id);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold">Model Statistics</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Total Elements"
          value={stats.element_count}
          icon={<Layers />}
        />
        <MetricCard
          title="With Geometry"
          value={`${stats.geometry_count} (${(stats.geometry_count / stats.element_count * 100).toFixed(1)}%)`}
          icon={<Cube />}
        />
        <MetricCard
          title="Property Sets"
          value={stats.property_count}
          icon={<List />}
        />
        <MetricCard
          title="Systems"
          value={stats.system_count}
          icon={<Network />}
        />
      </div>

      {/* Element Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Element Type Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.elements_by_type}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#1890ff"
                label
              />
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Elements by Storey */}
      <Card>
        <CardHeader>
          <CardTitle>Elements by Storey</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.elements_by_storey}>
              <XAxis dataKey="storey_name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#33a070" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Property Coverage */}
      <Card>
        <CardHeader>
          <CardTitle>Property Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyCoverageHeatmap data={stats.property_coverage} />
        </CardContent>
      </Card>

      {/* Material Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Material Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <MaterialUsageChart data={stats.materials} />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Scripts Tab (NEW)

**ScriptsTab.tsx**
```tsx
export function ScriptsTab({ model }: { model: Model }) {
  const { data: scripts } = useScripts();
  const { data: executions } = useScriptExecutions(model.id);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);

  return (
    <div className="h-full grid grid-cols-[300px_1fr]">
      {/* Script Library Sidebar */}
      <div className="border-r p-4 space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Script Library</h3>
          <Input placeholder="Search scripts..." />
        </div>

        <div className="space-y-2">
          {scripts.map(script => (
            <ScriptCard
              key={script.id}
              script={script}
              onClick={() => setSelectedScript(script)}
              active={selectedScript?.id === script.id}
            />
          ))}
        </div>

        <Button className="w-full" variant="outline">
          + Create Script
        </Button>
      </div>

      {/* Script Details & Execution */}
      <div className="p-6 space-y-6">
        {selectedScript ? (
          <>
            {/* Script Details */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedScript.name}</CardTitle>
                    <p className="text-sm text-text-secondary">
                      {selectedScript.description}
                    </p>
                  </div>
                  <Badge>{selectedScript.category}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Parameter Form */}
                <ScriptParameterForm
                  schema={selectedScript.parameters_schema}
                  onExecute={(params) => executeScript(selectedScript.id, model.id, params)}
                />
              </CardContent>
            </Card>

            {/* Execution History */}
            <Card>
              <CardHeader>
                <CardTitle>Execution History</CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionHistoryTable executions={executions} />
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-secondary">Select a script to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Implementation Roadmap

### Week 1: Database & Backend Foundation
**Day 1-2:**
- [ ] Create database migration for 4 new tables
- [ ] Implement Script, ScriptExecution, AutomationWorkflow, WorkflowExecution models
- [ ] Test migration on Supabase

**Day 3-4:**
- [ ] Create basic script runner service (Python subprocess execution)
- [ ] Implement script context builder (model data access)
- [ ] Test with simple "Hello World" script

**Day 5-7:**
- [ ] Create 3 built-in scripts (CSV export, GUID validator, LOD analyzer)
- [ ] Test script execution end-to-end
- [ ] Create API endpoints for scripts (GET, POST, PATCH, DELETE)

### Week 2: Script Execution API
**Day 1-3:**
- [ ] Create execute-script endpoint
- [ ] Create script-executions endpoint (list history)
- [ ] Create script-execution detail endpoint
- [ ] Test with Postman/curl

**Day 4-5:**
- [ ] Implement result file storage (Supabase Storage)
- [ ] Create download endpoint for result files
- [ ] Test file upload/download

**Day 6-7:**
- [ ] Integrate Celery for async execution
- [ ] Update execute-script to queue Celery task
- [ ] Test async execution with long-running script

### Week 3: Frontend Workspace
**Day 1-2:**
- [ ] Create ModelWorkspace component with tabs
- [ ] Implement tab navigation (Tabs component from shadcn/ui)
- [ ] Test routing and tab switching

**Day 3-4:**
- [ ] Build OverviewTab with dashboard layout
- [ ] Add validation status card
- [ ] Add statistics grid
- [ ] Add quick actions

**Day 5-6:**
- [ ] Build ValidationTab (display existing validation data)
- [ ] Create accordion for issue categories
- [ ] Test with real validation report

**Day 7:**
- [ ] Build StatisticsTab skeleton
- [ ] Install Recharts library
- [ ] Create first chart (Element type distribution)

### Week 4: Statistics & Charts
**Day 1-3:**
- [ ] Implement all charts in StatisticsTab
  - Element type distribution (pie chart)
  - Elements by storey (bar chart)
  - Property coverage heatmap
  - Material usage chart
- [ ] Create API endpoint for statistics aggregation
- [ ] Test with real model data

**Day 4-7:**
- [ ] Build ScriptsTab UI
  - Script library sidebar
  - Script details panel
  - Parameter form
  - Execution history table
- [ ] Connect to backend API
- [ ] Test script execution from UI

### Week 5: Automation & Workflows
**Day 1-3:**
- [ ] Implement automation_workflows model
- [ ] Create workflow trigger system (on_upload, scheduled)
- [ ] Test auto-validation on model upload

**Day 4-5:**
- [ ] Build workflow management UI
- [ ] Create workflow creation dialog
- [ ] Test manual workflow trigger

**Day 6-7:**
- [ ] Implement scheduled workflows (Celery beat)
- [ ] Test weekly/daily scheduled reports
- [ ] Build workflow execution history view

### Week 6: Polish & Documentation
**Day 1-2:**
- [ ] Add script editor (Monaco editor integration)
- [ ] Add syntax highlighting for Python
- [ ] Test creating custom script in UI

**Day 3-4:**
- [ ] Add execution status polling (real-time updates)
- [ ] Add download results button
- [ ] Add execution log viewer (collapsible)

**Day 5-7:**
- [ ] Write user guide for scripts
- [ ] Create video walkthrough
- [ ] Document API endpoints
- [ ] Add tooltips and help text throughout UI

---

## Success Metrics

### User Experience
- [ ] BIM coordinator can see validation results in < 2 clicks
- [ ] Can execute built-in script in < 3 clicks
- [ ] Script execution completes in < 30 seconds
- [ ] Can view comprehensive statistics without exporting to Excel
- [ ] Can set up auto-validation workflow in < 5 minutes

### Technical Performance
- [ ] Script execution: < 30s for typical operations
- [ ] Statistics page load: < 2s
- [ ] Chart rendering: < 1s per chart
- [ ] Script result files stored in Supabase Storage
- [ ] Execution history paginated (100 per page)

### Business Value
- [ ] Replaces manual Excel-based quality checks
- [ ] Automates repetitive validation tasks
- [ ] Provides actionable insights (not just raw data)
- [ ] Saves BIM coordinator 2+ hours per week
- [ ] Catches quality issues early (on upload)

---

## Risk Mitigation

### Script Security
**Risk:** User-created scripts execute arbitrary code
**Mitigation:**
- Run scripts in subprocess with timeout (5 minutes max)
- Whitelist available libraries (ifcopenshell, numpy, pandas only)
- No file system access (except via save_output function)
- No network access
- Future: Run in Docker containers for complete isolation

### Performance
**Risk:** Large model statistics calculations too slow
**Mitigation:**
- Cache statistics results (invalidate on model update)
- Run statistics calculation in Celery task
- Use database aggregation queries (not Python loops)
- Implement pagination for large result sets

### Storage
**Risk:** Script result files fill up storage
**Mitigation:**
- Automatic cleanup of old execution results (> 30 days)
- File size limit per execution (100 MB max)
- Storage quota per project (10 GB max)

### Workflow Spam
**Risk:** Scheduled workflows create too many executions
**Mitigation:**
- Rate limiting (max 10 workflow executions per hour)
- Workflow execution quota (max 1000 per month)
- Email notifications for workflow failures
- Admin dashboard to monitor workflow activity

---

## Open Questions

1. **Script Language Support**
   - Python only initially?
   - Future: JavaScript/TypeScript for client-side scripts?

2. **Script Versioning**
   - Should scripts have versions like models?
   - How to handle script updates after executions?

3. **User Permissions**
   - Who can create scripts? (All users vs. admins only)
   - Public vs. private script visibility
   - Can users share scripts across organizations?

4. **Workflow Limits**
   - Max workflows per project?
   - Max executions per month?
   - Billing implications?

5. **Result File Storage**
   - How long to keep execution results?
   - Automatic cleanup policy?
   - User-configurable retention?

---

## Related Documents

- **Session 002**: `session-002-bim-coordinator-platform.md` - Original architecture
- **Session 003**: `project-management/worklog/session-003.md` - IFC processing implementation
- **Session 005**: `project-management/worklog/session-005.md` - Validation service implementation
- **Frontend Design**: `frontend-design-system.md` - UI/UX patterns
- **Current TODO**: `project-management/to-do/current.md`

---

**Last Updated**: 2025-10-13
**Status**: Planning Complete, Ready for Implementation
**Next Action**: Create database migration for scripts tables
