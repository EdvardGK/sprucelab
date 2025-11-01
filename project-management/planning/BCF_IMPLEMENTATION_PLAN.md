# BCF Server Implementation Plan

**Date**: 2025-10-25
**Purpose**: Implement BCF (BIM Collaboration Format) server for coordination hub
**Strategic Goal**: Integrate with Solibri and other tools, don't compete on clash detection
**Status**: Planning phase

---

## Executive Summary

### Strategic Positioning

**THE PIVOT**: Don't build clash detection - let Solibri handle that (25+ years of expertise). Instead, build the **coordination hub** that Solibri and all other BIM tools sync TO via BCF.

**Why This is Brilliant**:
- ✅ Solibri is the industry standard for clash detection (don't compete)
- ✅ BCF is the universal coordination language (buildingSMART standard)
- ✅ Your platform becomes the **single source of truth** for all issues
- ✅ **Much faster to market** (BCF API vs full clash detection system)
- ✅ Works with ALL tools (Solibri, Revit, ArchiCAD, Navisworks, etc.)

### What BCF Provides

**BCF (BIM Collaboration Format)** is an XML-based format for communicating issues found in IFC models:

**Core Entities**:
- **Topics** (Issues): The problem/question/observation
- **Comments**: Discussion thread on each topic
- **Viewpoints**: 3D camera position + selected elements + snapshot image
- **Markup**: Visual annotations, dimensions, notes

**The Workflow**:
1. Solibri detects clash → Creates BCF topic with viewpoint
2. Uploads to your BCF server → Issue created in your platform
3. BIM coordinator reviews → Adds comments, assigns to discipline
4. Discipline lead responds → Updates status, adds resolution comment
5. Coordinator verifies → Closes issue
6. **Full history tracked** in your platform (BCF files are snapshots only)

---

## BCF Specification Overview

### BCF 2.1 vs BCF 3.0

| Feature | BCF 2.1 | BCF 3.0 |
|---------|---------|---------|
| **Status** | Widely adopted | Newer standard (2019+) |
| **Format** | XML + folder structure | RESTful API + JSON |
| **File Support** | .bcfzip (ZIP with XMLs) | API-first, optional file export |
| **Viewpoints** | Camera, components, lines, clipping | Same + extensions |
| **Snapshots** | PNG images | PNG images |
| **Authentication** | None (file-based) | OAuth 2.0, JWT |
| **Real-time Sync** | Manual (upload/download) | API-driven, webhooks possible |
| **Extensibility** | Limited (XML schema) | Extensions, custom fields |

**Recommendation**: **Implement BOTH**

**Why**:
- **BCF 2.1**: File-based import/export for compatibility (Solibri, older tools)
- **BCF 3.0**: RESTful API for modern integrations (web apps, Revit plugins)
- buildingSMART encourages dual support during transition period

**Implementation Strategy**:
- Start with **BCF 2.1 file import** (get Solibri integration working immediately)
- Add **BCF 3.0 REST API** (modern integrations, real-time sync)
- Export to both formats (universal compatibility)

---

## Database Schema Design

### Core Models

#### 1. **BCFTopic** (The Issue)

Extends or relates to your existing "Issues" concept:

```python
class BCFTopic(models.Model):
    """
    BCF Topic = Issue in your platform.

    This is the core entity representing a problem, question,
    or observation found in a model.
    """
    # Identification
    guid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    # BCF spec: Each topic has a GUID for tracking across systems

    # Project Context
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE)
    model = models.ForeignKey('models.Model', on_delete=models.CASCADE, null=True, blank=True)
    # Can be project-level (not tied to specific model) or model-specific

    # Topic Metadata
    title = models.CharField(max_length=255)
    # BCF spec: Short description of the issue

    description = models.TextField(blank=True)
    # BCF spec: Detailed description

    topic_type = models.CharField(max_length=100, blank=True)
    # BCF spec: "Clash", "Error", "Warning", "Info", "Unknown", or custom

    topic_status = models.CharField(max_length=50, default='Open')
    # BCF spec: "Open", "In Progress", "Closed", "Resolved", or custom

    priority = models.CharField(max_length=50, blank=True)
    # BCF spec: "Critical", "Major", "Normal", "Minor", or custom

    # Assignment
    assigned_to = models.CharField(max_length=255, blank=True)
    # BCF spec: Email or username of assigned person

    # Stage / Discipline
    stage = models.CharField(max_length=100, blank=True)
    # BCF spec: Project phase (Design, Construction, etc.)

    discipline = models.CharField(max_length=100, blank=True)
    # Architecture, Structure, MEP, etc.

    # Labels / Tags
    labels = models.JSONField(default=list, blank=True)
    # BCF spec: Array of strings for categorization

    # Timestamps
    creation_date = models.DateTimeField(auto_now_add=True)
    creation_author = models.CharField(max_length=255)

    modified_date = models.DateTimeField(auto_now=True)
    modified_author = models.CharField(max_length=255, blank=True)

    due_date = models.DateTimeField(null=True, blank=True)
    # Optional: When issue must be resolved

    # References
    reference_links = models.JSONField(default=list, blank=True)
    # BCF spec: URLs to related documents, issues, etc.

    # IFC Context (optional, for linking to specific elements)
    related_elements = models.ManyToManyField(
        'entities.IFCEntity',
        related_name='bcf_topics',
        blank=True
    )
    # Link BCF topics to specific IFC elements they reference

    # Metadata
    index = models.IntegerField(null=True, blank=True)
    # BCF spec: Ordering hint for display

    class Meta:
        ordering = ['-creation_date']
        indexes = [
            models.Index(fields=['guid']),
            models.Index(fields=['project', 'topic_status']),
            models.Index(fields=['creation_date']),
        ]

    def __str__(self):
        return f"{self.title} ({self.topic_status})"
```

#### 2. **BCFComment** (Discussion Thread)

```python
class BCFComment(models.Model):
    """
    Comments on a BCF Topic.

    BCF files only contain the current state - we maintain full history.
    """
    # Identification
    guid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # Relationship
    topic = models.ForeignKey(BCFTopic, on_delete=models.CASCADE, related_name='comments')

    # Content
    comment = models.TextField()
    # BCF spec: The comment text (can be HTML or plain text)

    # Author
    author = models.CharField(max_length=255)
    # BCF spec: Email or username

    # Timestamps
    date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    modified_author = models.CharField(max_length=255, blank=True)

    # Optional: Reply Threading
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    # Allow threaded discussions (not in BCF spec, but useful)

    # Optional: Viewpoint Reference
    viewpoint = models.ForeignKey(
        'BCFViewpoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='comments'
    )
    # Link comment to a specific viewpoint (BCF spec allows this)

    class Meta:
        ordering = ['date']
        indexes = [
            models.Index(fields=['topic', 'date']),
        ]

    def __str__(self):
        return f"Comment by {self.author} on {self.topic.title}"
```

#### 3. **BCFViewpoint** (3D Camera Position + Context)

```python
class BCFViewpoint(models.Model):
    """
    A saved 3D viewpoint showing the issue context.

    Includes camera position, selected elements, clipping planes, and snapshot image.
    """
    # Identification
    guid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # Relationship
    topic = models.ForeignKey(BCFTopic, on_delete=models.CASCADE, related_name='viewpoints')

    # Metadata
    index = models.IntegerField(null=True, blank=True)
    # BCF spec: Ordering of viewpoints for a topic

    # Camera (Orthogonal or Perspective)
    camera_data = models.JSONField()
    # BCF spec: {
    #   "camera_view_point": {"x": 0, "y": 0, "z": 0},
    #   "camera_direction": {"x": 0, "y": 0, "z": -1},
    #   "camera_up_vector": {"x": 0, "y": 1, "z": 0},
    #   "field_of_view": 60  # For perspective camera
    # }
    # OR
    # {
    #   "camera_view_point": {"x": 0, "y": 0, "z": 0},
    #   "camera_direction": {"x": 0, "y": 0, "z": -1},
    #   "camera_up_vector": {"x": 0, "y": 1, "z": 0},
    #   "view_to_world_scale": 1.0  # For orthogonal camera
    # }

    # Components (Selected/Visible/Hidden Elements)
    components = models.JSONField(default=dict, blank=True)
    # BCF spec: {
    #   "visibility": {
    #     "default_visibility": true,
    #     "exceptions": [
    #       {"ifc_guid": "...", "originating_system": "..."},
    #       ...
    #     ]
    #   },
    #   "selection": [
    #     {"ifc_guid": "...", "originating_system": "..."},
    #     ...
    #   ],
    #   "coloring": [
    #     {
    #       "color": "#FF0000",
    #       "components": [{"ifc_guid": "...", ...}]
    #     }
    #   ]
    # }

    # Lines (Markup Lines - optional)
    lines = models.JSONField(default=list, blank=True)
    # BCF spec: Array of line definitions for annotations
    # [
    #   {
    #     "start_point": {"x": 0, "y": 0, "z": 0},
    #     "end_point": {"x": 1, "y": 1, "z": 1}
    #   },
    #   ...
    # ]

    # Clipping Planes (Section Cuts - optional)
    clipping_planes = models.JSONField(default=list, blank=True)
    # BCF spec: Array of plane definitions
    # [
    #   {
    #     "location": {"x": 0, "y": 0, "z": 0},
    #     "direction": {"x": 0, "y": 0, "z": 1}
    #   },
    #   ...
    # ]

    # Bitmap (Snapshot Image)
    snapshot = models.ImageField(
        upload_to='bcf/snapshots/',
        null=True,
        blank=True
    )
    # BCF spec: PNG image showing the viewpoint
    # Stored in media storage (S3, local, etc.)

    bitmap_format = models.CharField(max_length=10, default='PNG')
    # BCF spec: Usually "PNG", can be "JPG"

    # Metadata
    creation_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['index', 'creation_date']
        indexes = [
            models.Index(fields=['topic']),
        ]

    def __str__(self):
        return f"Viewpoint {self.index} for {self.topic.title}"
```

#### 4. **BCFFile** (Track Imported/Exported Files)

```python
class BCFFile(models.Model):
    """
    Track BCF .bcfzip files uploaded/downloaded for audit trail.
    """
    # Identification
    guid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # File
    file = models.FileField(upload_to='bcf/files/')
    filename = models.CharField(max_length=255)

    # Metadata
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE)
    uploaded_by = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # Processing Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'),
            ('processing', 'Processing'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
        ],
        default='pending'
    )

    # Results
    topics_imported = models.IntegerField(default=0)
    topics_updated = models.IntegerField(default=0)
    topics_skipped = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)

    # Direction
    direction = models.CharField(
        max_length=10,
        choices=[
            ('import', 'Import'),
            ('export', 'Export'),
        ]
    )

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.direction.title()}: {self.filename}"
```

#### 5. **BCFIssueHistory** (Track All Changes)

```python
class BCFIssueHistory(models.Model):
    """
    Audit trail for BCF topic changes.

    BCF files don't contain history - we track every change.
    """
    # Relationship
    topic = models.ForeignKey(BCFTopic, on_delete=models.CASCADE, related_name='history')

    # Change Metadata
    changed_at = models.DateTimeField(auto_now_add=True)
    changed_by = models.CharField(max_length=255)

    # What Changed
    field_name = models.CharField(max_length=100)
    # e.g., "topic_status", "assigned_to", "priority"

    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)

    # Optional: Change Source
    source = models.CharField(
        max_length=50,
        choices=[
            ('web', 'Web Interface'),
            ('api', 'API'),
            ('bcf_import', 'BCF Import'),
            ('solibri', 'Solibri Sync'),
            ('revit', 'Revit Plugin'),
            ('other', 'Other'),
        ],
        default='web'
    )

    class Meta:
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['topic', 'changed_at']),
        ]

    def __str__(self):
        return f"{self.topic.title}: {self.field_name} changed by {self.changed_by}"
```

---

## BCF 2.1 File Format Implementation

### File Structure

BCF 2.1 uses a ZIP file (.bcfzip) with this structure:

```
example.bcfzip
├── bcf.version               # BCF version info
├── project.bcfp              # Optional: Project metadata
├── markup.bcf                # List of topics (index file)
└── [topic-guid]/
    ├── markup.bcf            # Topic + comments + viewpoints
    ├── viewpoint.bcfv        # Viewpoint camera/components
    ├── snapshot.png          # Viewpoint image
    └── ...                   # Additional viewpoints
```

### Parser Implementation

**File**: `backend/apps/bcf/services/bcf21_parser.py`

```python
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from django.core.files.base import ContentFile
from apps.bcf.models import BCFTopic, BCFComment, BCFViewpoint, BCFFile

class BCF21Parser:
    """
    Parse BCF 2.1 .bcfzip files and import to database.
    """

    def parse_bcfzip(self, file_path, project_id, uploaded_by):
        """
        Main entry point: Parse .bcfzip file.

        Args:
            file_path: Path to .bcfzip file
            project_id: UUID of project to import into
            uploaded_by: Username/email of uploader

        Returns:
            dict: {
                'topics_imported': int,
                'topics_updated': int,
                'topics_skipped': int,
                'errors': list
            }
        """
        results = {
            'topics_imported': 0,
            'topics_updated': 0,
            'topics_skipped': 0,
            'errors': []
        }

        try:
            with zipfile.ZipFile(file_path, 'r') as bcf_zip:
                # 1. Parse bcf.version
                version_info = self._parse_version(bcf_zip)
                if version_info['version_id'] != '2.1':
                    results['errors'].append(f"Unsupported BCF version: {version_info['version_id']}")
                    return results

                # 2. Parse project.bcfp (optional)
                project_info = self._parse_project(bcf_zip)

                # 3. Parse markup.bcf (topic index)
                topic_guids = self._parse_markup_index(bcf_zip)

                # 4. Parse each topic folder
                for topic_guid in topic_guids:
                    try:
                        topic_data = self._parse_topic(bcf_zip, topic_guid)

                        # Check if topic exists (by GUID)
                        existing_topic = BCFTopic.objects.filter(guid=topic_guid).first()

                        if existing_topic:
                            # Update existing topic
                            self._update_topic(existing_topic, topic_data, uploaded_by)
                            results['topics_updated'] += 1
                        else:
                            # Create new topic
                            self._create_topic(topic_data, project_id, uploaded_by)
                            results['topics_imported'] += 1

                    except Exception as e:
                        results['errors'].append(f"Topic {topic_guid}: {str(e)}")
                        results['topics_skipped'] += 1

        except Exception as e:
            results['errors'].append(f"File parsing error: {str(e)}")

        return results

    def _parse_topic(self, bcf_zip, topic_guid):
        """
        Parse a single topic folder.

        Returns:
            dict: {
                'topic': {...},  # BCFTopic fields
                'comments': [...],  # List of BCFComment data
                'viewpoints': [...]  # List of BCFViewpoint data
            }
        """
        # Read markup.bcf for this topic
        markup_path = f"{topic_guid}/markup.bcf"
        markup_xml = bcf_zip.read(markup_path).decode('utf-8')
        root = ET.fromstring(markup_xml)

        # Parse Topic
        topic_elem = root.find('Topic')
        topic_data = {
            'guid': topic_elem.get('Guid'),
            'topic_type': topic_elem.get('TopicType', ''),
            'topic_status': topic_elem.get('TopicStatus', 'Open'),
            'title': topic_elem.findtext('Title', ''),
            'priority': topic_elem.findtext('Priority', ''),
            'index': int(topic_elem.findtext('Index', 0)),
            'labels': [label.text for label in topic_elem.findall('Labels/Label')],
            'creation_date': topic_elem.findtext('CreationDate'),
            'creation_author': topic_elem.findtext('CreationAuthor', ''),
            'modified_date': topic_elem.findtext('ModifiedDate'),
            'modified_author': topic_elem.findtext('ModifiedAuthor', ''),
            'due_date': topic_elem.findtext('DueDate'),
            'assigned_to': topic_elem.findtext('AssignedTo', ''),
            'description': topic_elem.findtext('Description', ''),
            'stage': topic_elem.findtext('Stage', ''),
            'reference_links': [link.text for link in topic_elem.findall('ReferenceLink')],
        }

        # Parse Comments
        comments = []
        for comment_elem in root.findall('Comment'):
            comment_data = {
                'guid': comment_elem.get('Guid'),
                'date': comment_elem.findtext('Date'),
                'author': comment_elem.findtext('Author', ''),
                'comment': comment_elem.findtext('Comment', ''),
                'viewpoint_guid': comment_elem.findtext('Viewpoint/@Guid'),
                'modified_date': comment_elem.findtext('ModifiedDate'),
                'modified_author': comment_elem.findtext('ModifiedAuthor', ''),
            }
            comments.append(comment_data)

        # Parse Viewpoints
        viewpoints = []
        for viewpoint_elem in root.findall('Viewpoints/ViewPoint'):
            viewpoint_guid = viewpoint_elem.get('Guid')
            snapshot_filename = viewpoint_elem.findtext('Snapshot')
            viewpoint_filename = viewpoint_elem.findtext('Viewpoint')  # .bcfv file
            index = int(viewpoint_elem.findtext('Index', 0))

            # Read viewpoint.bcfv (camera, components, etc.)
            viewpoint_path = f"{topic_guid}/{viewpoint_filename}"
            viewpoint_xml = bcf_zip.read(viewpoint_path).decode('utf-8')
            viewpoint_root = ET.fromstring(viewpoint_xml)

            # Parse camera data
            camera_data = self._parse_camera(viewpoint_root)

            # Parse components (visibility, selection, coloring)
            components = self._parse_components(viewpoint_root)

            # Parse lines (markup)
            lines = self._parse_lines(viewpoint_root)

            # Parse clipping planes
            clipping_planes = self._parse_clipping_planes(viewpoint_root)

            # Read snapshot image
            snapshot_data = None
            if snapshot_filename:
                snapshot_path = f"{topic_guid}/{snapshot_filename}"
                snapshot_data = bcf_zip.read(snapshot_path)

            viewpoint_data = {
                'guid': viewpoint_guid,
                'index': index,
                'camera_data': camera_data,
                'components': components,
                'lines': lines,
                'clipping_planes': clipping_planes,
                'snapshot_data': snapshot_data,
                'snapshot_filename': snapshot_filename,
            }
            viewpoints.append(viewpoint_data)

        return {
            'topic': topic_data,
            'comments': comments,
            'viewpoints': viewpoints
        }

    def _create_topic(self, topic_data, project_id, uploaded_by):
        """Create BCFTopic and related entities."""
        # Create topic
        topic = BCFTopic.objects.create(
            guid=topic_data['topic']['guid'],
            project_id=project_id,
            **topic_data['topic']
        )

        # Create comments
        for comment_data in topic_data['comments']:
            BCFComment.objects.create(
                topic=topic,
                **comment_data
            )

        # Create viewpoints
        for viewpoint_data in topic_data['viewpoints']:
            snapshot_file = None
            if viewpoint_data['snapshot_data']:
                snapshot_file = ContentFile(
                    viewpoint_data['snapshot_data'],
                    name=viewpoint_data['snapshot_filename']
                )

            BCFViewpoint.objects.create(
                topic=topic,
                guid=viewpoint_data['guid'],
                index=viewpoint_data['index'],
                camera_data=viewpoint_data['camera_data'],
                components=viewpoint_data['components'],
                lines=viewpoint_data['lines'],
                clipping_planes=viewpoint_data['clipping_planes'],
                snapshot=snapshot_file,
            )

        return topic

    # Helper methods for parsing specific XML sections...
    # (camera, components, lines, clipping planes)
```

### Exporter Implementation

**File**: `backend/apps/bcf/services/bcf21_exporter.py`

```python
import zipfile
import xml.etree.ElementTree as ET
from xml.dom import minidom
from io import BytesIO
from apps.bcf.models import BCFTopic

class BCF21Exporter:
    """
    Export BCF topics to .bcfzip file (BCF 2.1 format).
    """

    def export_topics(self, topic_ids, project_name='Project'):
        """
        Export topics to .bcfzip file.

        Args:
            topic_ids: List of BCFTopic IDs to export
            project_name: Name of project (for project.bcfp)

        Returns:
            BytesIO: In-memory .bcfzip file
        """
        topics = BCFTopic.objects.filter(id__in=topic_ids).prefetch_related(
            'comments', 'viewpoints'
        )

        # Create in-memory ZIP
        zip_buffer = BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as bcf_zip:
            # 1. bcf.version
            version_xml = self._create_version_xml()
            bcf_zip.writestr('bcf.version', version_xml)

            # 2. project.bcfp (optional)
            project_xml = self._create_project_xml(project_name)
            bcf_zip.writestr('project.bcfp', project_xml)

            # 3. markup.bcf (topic index)
            markup_xml = self._create_markup_index_xml(topics)
            bcf_zip.writestr('markup.bcf', markup_xml)

            # 4. Each topic folder
            for topic in topics:
                topic_guid = str(topic.guid)

                # markup.bcf (topic details)
                topic_markup_xml = self._create_topic_markup_xml(topic)
                bcf_zip.writestr(f"{topic_guid}/markup.bcf", topic_markup_xml)

                # Viewpoints
                for viewpoint in topic.viewpoints.all():
                    viewpoint_guid = str(viewpoint.guid)

                    # viewpoint.bcfv (camera, components)
                    viewpoint_xml = self._create_viewpoint_xml(viewpoint)
                    bcf_zip.writestr(f"{topic_guid}/{viewpoint_guid}.bcfv", viewpoint_xml)

                    # snapshot.png (image)
                    if viewpoint.snapshot:
                        viewpoint.snapshot.open('rb')
                        snapshot_data = viewpoint.snapshot.read()
                        viewpoint.snapshot.close()
                        bcf_zip.writestr(f"{topic_guid}/{viewpoint_guid}.png", snapshot_data)

        zip_buffer.seek(0)
        return zip_buffer

    def _create_topic_markup_xml(self, topic):
        """Create markup.bcf XML for a topic."""
        markup = ET.Element('Markup')

        # Topic element
        topic_elem = ET.SubElement(markup, 'Topic', {
            'Guid': str(topic.guid),
            'TopicType': topic.topic_type or '',
            'TopicStatus': topic.topic_status,
        })
        ET.SubElement(topic_elem, 'Title').text = topic.title
        ET.SubElement(topic_elem, 'Priority').text = topic.priority or ''
        ET.SubElement(topic_elem, 'Index').text = str(topic.index or 0)
        ET.SubElement(topic_elem, 'CreationDate').text = topic.creation_date.isoformat()
        ET.SubElement(topic_elem, 'CreationAuthor').text = topic.creation_author

        if topic.modified_date:
            ET.SubElement(topic_elem, 'ModifiedDate').text = topic.modified_date.isoformat()
        if topic.modified_author:
            ET.SubElement(topic_elem, 'ModifiedAuthor').text = topic.modified_author
        if topic.assigned_to:
            ET.SubElement(topic_elem, 'AssignedTo').text = topic.assigned_to
        if topic.description:
            ET.SubElement(topic_elem, 'Description').text = topic.description

        # Labels
        if topic.labels:
            labels_elem = ET.SubElement(topic_elem, 'Labels')
            for label in topic.labels:
                ET.SubElement(labels_elem, 'Label').text = label

        # Comments
        for comment in topic.comments.all():
            comment_elem = ET.SubElement(markup, 'Comment', {'Guid': str(comment.guid)})
            ET.SubElement(comment_elem, 'Date').text = comment.date.isoformat()
            ET.SubElement(comment_elem, 'Author').text = comment.author
            ET.SubElement(comment_elem, 'Comment').text = comment.comment

            if comment.viewpoint:
                viewpoint_ref = ET.SubElement(comment_elem, 'Viewpoint')
                viewpoint_ref.set('Guid', str(comment.viewpoint.guid))

        # Viewpoints
        viewpoints_elem = ET.SubElement(markup, 'Viewpoints')
        for viewpoint in topic.viewpoints.all():
            vp_elem = ET.SubElement(viewpoints_elem, 'ViewPoint', {'Guid': str(viewpoint.guid)})
            ET.SubElement(vp_elem, 'Viewpoint').text = f"{viewpoint.guid}.bcfv"
            ET.SubElement(vp_elem, 'Snapshot').text = f"{viewpoint.guid}.png"
            ET.SubElement(vp_elem, 'Index').text = str(viewpoint.index or 0)

        # Pretty print
        return self._prettify_xml(markup)

    def _prettify_xml(self, elem):
        """Return pretty-printed XML string."""
        rough_string = ET.tostring(elem, encoding='utf-8')
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ", encoding='utf-8').decode('utf-8')
```

---

## BCF 3.0 REST API Implementation

### API Endpoints (buildingSMART spec)

#### Authentication
```
POST   /bcf/3.0/auth/oauth2/token       # OAuth 2.0 token
GET    /bcf/3.0/current-user            # Current user info
```

#### Projects
```
GET    /bcf/3.0/projects                # List projects
GET    /bcf/3.0/projects/{project_id}   # Get project
```

#### Topics
```
GET    /bcf/3.0/projects/{project_id}/topics                    # List topics
POST   /bcf/3.0/projects/{project_id}/topics                    # Create topic
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}         # Get topic
PUT    /bcf/3.0/projects/{project_id}/topics/{topic_id}         # Update topic
DELETE /bcf/3.0/projects/{project_id}/topics/{topic_id}         # Delete topic
```

#### Comments
```
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/comments              # List comments
POST   /bcf/3.0/projects/{project_id}/topics/{topic_id}/comments              # Create comment
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/comments/{comment_id}  # Get comment
PUT    /bcf/3.0/projects/{project_id}/topics/{topic_id}/comments/{comment_id}  # Update comment
DELETE /bcf/3.0/projects/{project_id}/topics/{topic_id}/comments/{comment_id}  # Delete comment
```

#### Viewpoints
```
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints                  # List viewpoints
POST   /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints                  # Create viewpoint
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints/{viewpoint_id}    # Get viewpoint
PUT    /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints/{viewpoint_id}    # Update viewpoint
DELETE /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints/{viewpoint_id}    # Delete viewpoint
```

#### Snapshots
```
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/viewpoints/{viewpoint_id}/snapshot  # Get snapshot image
```

#### Files
```
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/files         # List files
POST   /bcf/3.0/projects/{project_id}/topics/{topic_id}/files         # Upload file
GET    /bcf/3.0/projects/{project_id}/topics/{topic_id}/files/{file_id}  # Download file
```

### Django REST Framework Views

**File**: `backend/apps/bcf/views.py`

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.bcf.models import BCFTopic, BCFComment, BCFViewpoint
from apps.bcf.serializers import BCFTopicSerializer, BCFCommentSerializer, BCFViewpointSerializer

class BCFTopicViewSet(viewsets.ModelViewSet):
    """
    BCF 3.0 API: Topics endpoint
    """
    queryset = BCFTopic.objects.all()
    serializer_class = BCFTopicSerializer

    def get_queryset(self):
        """Filter topics by project."""
        project_id = self.kwargs.get('project_id')
        return BCFTopic.objects.filter(project_id=project_id)

    def perform_create(self, serializer):
        """Set project and creation metadata."""
        project_id = self.kwargs.get('project_id')
        serializer.save(
            project_id=project_id,
            creation_author=self.request.user.username
        )

    @action(detail=True, methods=['get'])
    def comments(self, request, project_id=None, pk=None):
        """List comments for a topic."""
        topic = self.get_object()
        comments = topic.comments.all()
        serializer = BCFCommentSerializer(comments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def viewpoints(self, request, project_id=None, pk=None):
        """List viewpoints for a topic."""
        topic = self.get_object()
        viewpoints = topic.viewpoints.all()
        serializer = BCFViewpointSerializer(viewpoints, many=True)
        return Response(serializer.data)

class BCFCommentViewSet(viewsets.ModelViewSet):
    """
    BCF 3.0 API: Comments endpoint
    """
    queryset = BCFComment.objects.all()
    serializer_class = BCFCommentSerializer

    def get_queryset(self):
        """Filter comments by topic."""
        topic_id = self.kwargs.get('topic_id')
        return BCFComment.objects.filter(topic_id=topic_id)

    def perform_create(self, serializer):
        """Set topic and author."""
        topic_id = self.kwargs.get('topic_id')
        serializer.save(
            topic_id=topic_id,
            author=self.request.user.username
        )

class BCFViewpointViewSet(viewsets.ModelViewSet):
    """
    BCF 3.0 API: Viewpoints endpoint
    """
    queryset = BCFViewpoint.objects.all()
    serializer_class = BCFViewpointSerializer

    def get_queryset(self):
        """Filter viewpoints by topic."""
        topic_id = self.kwargs.get('topic_id')
        return BCFViewpoint.objects.filter(topic_id=topic_id)

    def perform_create(self, serializer):
        """Set topic."""
        topic_id = self.kwargs.get('topic_id')
        serializer.save(topic_id=topic_id)

    @action(detail=True, methods=['get'])
    def snapshot(self, request, project_id=None, topic_id=None, pk=None):
        """Get snapshot image."""
        viewpoint = self.get_object()
        if viewpoint.snapshot:
            return Response(viewpoint.snapshot.url)
        return Response({'error': 'No snapshot available'}, status=404)
```

---

## Integration with Solibri

### Solibri BCF Workflow

1. **Clash Detection in Solibri**:
   - Run clash detection in Solibri Office
   - Create BCF issues for clashes
   - Assign discipline, priority, status
   - Add screenshots (viewpoints)

2. **Export from Solibri**:
   - File → Export → BCF
   - Saves .bcfzip file

3. **Import to Your Platform**:
   - Upload .bcfzip via API or web interface
   - Parser extracts topics, comments, viewpoints
   - Creates BCFTopic, BCFComment, BCFViewpoint in database
   - Links to IFC elements if GUIDs match

4. **Coordination in Your Platform**:
   - BIM coordinator reviews issues
   - Adds comments, assigns tasks
   - Tracks resolution status
   - **Full history maintained** (Solibri doesn't track this)

5. **Export Back to Solibri**:
   - Export updated .bcfzip
   - Import in Solibri
   - Solibri updates status, shows new comments

### Solibri BCF Server Integration

Solibri Office supports **direct BCF server connections**:

**Setup**:
1. In Solibri: Tools → BCF Servers → Add Server
2. Enter your BCF API endpoint: `https://yourplatform.com/bcf/3.0`
3. OAuth 2.0 authentication
4. Solibri syncs issues directly (no file export/import!)

**Benefits**:
- **Real-time sync** (no manual export/import)
- **Full history** maintained in your platform
- **Multi-user coordination** (everyone sees same issues)
- **Automatic updates** (status changes sync both ways)

### Implementation Checklist

**For Solibri Integration**:
- [x] Implement BCF 2.1 file import (.bcfzip)
- [x] Implement BCF 2.1 file export (.bcfzip)
- [x] Implement BCF 3.0 REST API (OAuth 2.0)
- [ ] Test with Solibri Office (import/export)
- [ ] Test with Solibri BCF Server connection
- [ ] Handle GUID matching (BCF → IFC elements)
- [ ] Viewpoint rendering (camera position in viewer)

---

## Roadmap & Milestones

### Phase 1: BCF File Support (2-3 weeks)

**Goal**: Import/export .bcfzip files from Solibri

**Tasks**:
1. **Week 1: Database Schema**
   - Create `apps/bcf/` Django app
   - Implement models (BCFTopic, BCFComment, BCFViewpoint, BCFFile, BCFIssueHistory)
   - Run migrations
   - Create admin interface for testing

2. **Week 2: BCF 2.1 Parser**
   - Implement `bcf21_parser.py`
   - Parse bcf.version, project.bcfp, markup.bcf
   - Parse topics, comments, viewpoints
   - Extract snapshot images
   - Link to IFC elements (by GUID)

3. **Week 3: BCF 2.1 Exporter**
   - Implement `bcf21_exporter.py`
   - Generate .bcfzip files
   - Test export → import roundtrip
   - Test with Solibri (export from Solibri, import to platform, export from platform, import to Solibri)

**Deliverable**:
- ✅ Upload .bcfzip from Solibri
- ✅ View topics, comments, viewpoints in web interface
- ✅ Export to .bcfzip for Solibri
- ✅ Roundtrip works (no data loss)

### Phase 2: BCF REST API (3-4 weeks)

**Goal**: Direct integration with Solibri BCF Server

**Tasks**:
1. **Week 1: API Endpoints**
   - Implement BCF 3.0 REST API (DRF viewsets)
   - Authentication (OAuth 2.0 or API keys)
   - Projects, Topics, Comments, Viewpoints endpoints

2. **Week 2: Testing & Documentation**
   - API documentation (Swagger/OpenAPI)
   - Test with Postman/curl
   - Test with Solibri BCF Server connection

3. **Week 3: Sync & History**
   - Implement conflict resolution (what if topic updated in both systems?)
   - Track all changes in BCFIssueHistory
   - Webhooks for real-time updates

4. **Week 4: Polish**
   - Error handling
   - Performance optimization (query optimization, caching)
   - Monitoring (API usage, error rates)

**Deliverable**:
- ✅ Solibri connects to BCF API
- ✅ Topics sync in real-time
- ✅ Full history tracked in platform
- ✅ Webhooks notify on changes

### Phase 3: Viewer Integration (4-6 weeks)

**Goal**: Display BCF viewpoints in 3D viewer

**Tasks**:
1. **Implement Viewpoint Rendering**
   - Parse camera position (orthogonal/perspective)
   - Set camera in viewer (xeokit or Three.js)
   - Highlight selected elements
   - Hide/show elements based on visibility rules
   - Apply coloring (clash highlighting)
   - Display snapshot as overlay (picture-in-picture)

2. **Create BCF Viewpoints from Viewer**
   - Capture current camera position
   - Save selected elements
   - Take snapshot (canvas screenshot)
   - Create BCFViewpoint in database

3. **BCF Navigation UI**
   - Issue list panel (filter by status, priority, assigned_to)
   - Issue detail panel (comments, viewpoints, history)
   - Viewpoint switcher (cycle through viewpoints for a topic)
   - Create issue from viewer (select elements, capture view, add description)

**Deliverable**:
- ✅ Click issue → viewer navigates to viewpoint
- ✅ Create issue from viewer
- ✅ Full BCF coordination workflow in platform

---

## Success Metrics

### Technical Metrics

- **Roundtrip Fidelity**: 100% of data preserved (export → import → export)
- **Parse Performance**: <5 seconds for .bcfzip with 100 topics
- **API Latency**: <200ms for topic list, <500ms for topic detail
- **Sync Reliability**: 99%+ success rate for Solibri sync

### Business Metrics

- **Integration Success**: 10+ projects using Solibri → Your Platform workflow
- **Issue Volume**: 1000+ BCF topics tracked in platform
- **Coordinator Adoption**: 20+ BIM coordinators using BCF features weekly
- **Time Savings**: Track time from "Solibri export" to "Issue resolution" (target: 50% reduction)

### User Satisfaction

- **Solibri Users**: Can sync with platform without friction
- **Coordinators**: Full issue history (not just current snapshot)
- **Management**: Visibility into coordination progress (dashboards)

---

## Open Questions & Decisions

### 1. Issue Lifecycle vs BCF Status

**Question**: BCF has limited status values ("Open", "Closed", etc.). Your platform may want richer workflow states. How to map?

**Options**:
- **A**: Use BCF status as-is, add internal "sub-status" field
- **B**: Map internal status → BCF status on export
- **C**: Use BCF "labels" for extended workflow states

**Recommendation**: **Option B** - maintain rich internal states, map to BCF on export for compatibility.

### 2. User Management

**Question**: BCF uses email/username for authors. How to link to your User model?

**Options**:
- **A**: Store email string only (BCF spec), no User FK
- **B**: Try to match email → User, fall back to string
- **C**: Require User account for all BCF participants

**Recommendation**: **Option B** - match when possible, allow external users (Solibri users may not have accounts in your platform).

### 3. Conflict Resolution

**Question**: What if a topic is updated in both Solibri and your platform simultaneously?

**Options**:
- **A**: Last write wins (overwrite)
- **B**: Merge (combine comments, keep latest metadata)
- **C**: Flag conflicts, require manual resolution

**Recommendation**: **Start with Option A** (simple), add merge logic later if needed.

### 4. Element Linking

**Question**: BCF references IFC elements by GUID. How to link BCFTopic → IFCEntity?

**Current Setup**: You have `IFCEntity` with `ifc_guid` field.

**Implementation**:
```python
# In BCF21Parser._create_topic()
if viewpoint_data['components']['selection']:
    for component in viewpoint_data['components']['selection']:
        ifc_guid = component['ifc_guid']
        entity = IFCEntity.objects.filter(ifc_guid=ifc_guid).first()
        if entity:
            topic.related_elements.add(entity)
```

**Benefit**: Can query "All BCF topics related to this wall" → useful for change impact analysis.

---

## Next Steps (Immediate)

### Week 1-2: Foundation

1. **Create BCF App**
   ```bash
   cd backend
   python manage.py startapp bcf apps/bcf
   ```

2. **Implement Models**
   - Copy database schema from this document
   - Run `python manage.py makemigrations bcf`
   - Run `python manage.py migrate`

3. **Create Admin Interface**
   - Register models in `apps/bcf/admin.py`
   - Test creating topics manually

4. **Research BCF Spec**
   - Download sample .bcfzip files
   - Extract and examine XML structure
   - Test with Solibri trial version

### Week 3-4: Parser & Exporter

1. **Implement Parser**
   - Create `apps/bcf/services/bcf21_parser.py`
   - Start with basic parsing (topic title, description, status)
   - Add comments, viewpoints, snapshots incrementally

2. **Implement Exporter**
   - Create `apps/bcf/services/bcf21_exporter.py`
   - Start with basic export (topic metadata)
   - Add comments, viewpoints, snapshots incrementally

3. **Test Roundtrip**
   - Export from Solibri → Import to platform
   - Export from platform → Import to Solibri
   - Verify no data loss

### Week 5-6: API

1. **Implement BCF 3.0 API**
   - Create DRF viewsets
   - Add OAuth 2.0 or API key authentication
   - Test with Postman

2. **Test with Solibri**
   - Configure Solibri BCF Server connection
   - Sync topics
   - Verify real-time updates

---

**Last Updated**: 2025-10-25
**Status**: ✅ Implementation Plan Complete
**Next Action**: Create `apps/bcf/` Django app and implement database models
