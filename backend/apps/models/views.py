from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
from pathlib import Path

from django_q.tasks import async_task
from .models import Model
from .serializers import (
    ModelSerializer,
    ModelDetailSerializer,
    ModelUploadSerializer,
    IFCValidationReportSerializer
)
from .tasks import process_ifc_task, revert_model_task
from apps.projects.models import Project
from apps.entities.models import IFCValidationReport, IFCEntity
import json


class ModelViewSet(viewsets.ModelViewSet):
    """
    API endpoint for IFC models.

    list: Get all models (optionally filtered by ?project={project_id})
    create: Create a new model (use upload action instead)
    retrieve: Get a single model with details
    update: Update a model
    partial_update: Partially update a model
    destroy: Delete a model
    upload: Upload an IFC file
    """
    queryset = Model.objects.all()
    serializer_class = ModelSerializer

    def get_queryset(self):
        """
        Filter models by project if project query parameter is provided.

        Usage: GET /api/models/?project={project_id}
        """
        queryset = Model.objects.all()

        # Filter by project if provided
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)

        return queryset

    def get_serializer_class(self):
        """Use detailed serializer for retrieve action."""
        if self.action == 'retrieve':
            return ModelDetailSerializer
        elif self.action == 'upload':
            return ModelUploadSerializer
        return ModelSerializer

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """
        Upload an IFC file and create a model entry.

        POST /api/models/upload/

        Request:
            - file: IFC file (multipart/form-data)
            - project_id: UUID of the project
            - name: Optional model name (defaults to filename without extension)

        Response:
            - model: Created model object with auto-incremented version_number
            - message: Success message

        Note: Version numbers are automatically calculated based on existing
        models with the same name in the project. First upload = v1, subsequent
        uploads of the same model name auto-increment (v2, v3, etc.)
        """
        serializer = ModelUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data['file']
        project_id = serializer.validated_data['project_id']
        name = serializer.validated_data.get('name', Path(uploaded_file.name).stem)

        # Get project
        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': f'Project {project_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Auto-increment version number based on model name
        # Find latest version for models with the same name in this project
        latest_version = Model.objects.filter(
            project=project,
            name=name
        ).order_by('-version_number').first()

        if latest_version:
            # Increment version for this model name
            version_number = latest_version.version_number + 1
            parent_model = latest_version
        else:
            # First version of this model name
            version_number = 1
            parent_model = None

        # Save file temporarily (we'll upload to Supabase storage later)
        # For now, save to local media folder
        file_path = f'ifc_files/{project.id}/{uploaded_file.name}'
        saved_path = default_storage.save(file_path, ContentFile(uploaded_file.read()))
        file_url = default_storage.url(saved_path) if hasattr(default_storage, 'url') else saved_path

        # Create model entry
        model = Model.objects.create(
            project=project,
            name=name,
            original_filename=uploaded_file.name,
            file_url=file_url,
            file_size=uploaded_file.size,  # Save file size in bytes
            version_number=version_number,
            parent_model=parent_model,  # Link to previous version
            status='processing'  # Set to processing immediately
        )

        # Start async processing with Django-Q
        # NOTE: Using skip_geometry=True for fast client-side rendering with IFC.js
        # Frontend will download the IFC file directly from Supabase Storage
        # and render it in the browser using web-ifc-three (1-2 seconds vs 2-5 minutes)
        full_path = default_storage.path(saved_path)
        task_id = async_task(
            process_ifc_task,
            str(model.id),
            full_path,
            skip_geometry=True  # ← Skip geometry extraction (client-side rendering)
        )

        # Store task ID in model
        model.task_id = task_id
        model.save(update_fields=['task_id'])

        print(f"✅ IFC processing task queued (metadata only): {task_id}")

        # Return response immediately (don't wait for processing)
        response_serializer = ModelDetailSerializer(model)
        return Response({
            'model': response_serializer.data,
            'task_id': task_id,
            'message': f'File uploaded successfully. Processing started. Use GET /api/models/{model.id}/status/ to check progress.'
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser], url_path='upload-with-metadata')
    def upload_with_metadata(self, request):
        """
        Upload IFC file with pre-parsed metadata from web-ifc (frontend).

        NO BACKEND PARSING! Frontend already parsed with web-ifc in browser.

        POST /api/models/upload-with-metadata/

        Request (multipart/form-data):
            - file: IFC file
            - project_id: UUID
            - name: Model name
            - version_number: int (optional, auto-increments if not provided)
            - ifc_schema: string (IFC2X3, IFC4, etc.)
            - element_count: int
            - storey_count: int
            - system_count: int
            - metadata: JSON string (optional: full element list)

        Response:
            - model: Model object (already parsed, status='ready')
            - message: Success message
        """
        try:
            # Get file and basic info
            file = request.FILES.get('file')
            project_id = request.data.get('project_id')
            name = request.data.get('name')
            version_number = request.data.get('version_number')

            # Get pre-parsed metadata from frontend
            ifc_schema = request.data.get('ifc_schema', '')
            element_count = int(request.data.get('element_count', 0))
            storey_count = int(request.data.get('storey_count', 0))
            system_count = int(request.data.get('system_count', 0))

            if not all([file, project_id, name]):
                return Response(
                    {'error': 'Missing required fields: file, project_id, name'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get project
            try:
                project = Project.objects.get(id=project_id)
            except Project.DoesNotExist:
                return Response(
                    {'error': f'Project {project_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Auto-increment version if not provided
            if version_number:
                version_number = int(version_number)
            else:
                latest = Model.objects.filter(project=project, name=name).order_by('-version_number').first()
                version_number = (latest.version_number + 1) if latest else 1

            # Save file to storage
            file_path = f'ifc_files/{project.id}/{file.name}'
            saved_path = default_storage.save(file_path, ContentFile(file.read()))
            file_url = default_storage.url(saved_path) if hasattr(default_storage, 'url') else saved_path

            # Create model record with pre-parsed metadata
            model = Model.objects.create(
                project=project,
                name=name,
                original_filename=file.name,
                version_number=version_number,
                file_url=file_url,
                file_size=file.size,
                ifc_schema=ifc_schema,
                element_count=element_count,
                storey_count=storey_count,
                system_count=system_count,
                # IMPORTANT: Mark as already parsed by frontend!
                parsing_status='parsed',
                geometry_status='completed',  # Frontend has geometry
                validation_status='pending',
                status='ready'  # Model is ready to use immediately!
            )

            # Optionally: Store entities from metadata (bulk insert)
            metadata_json = request.data.get('metadata')
            entities_created_count = 0
            if metadata_json:
                try:
                    metadata = json.loads(metadata_json)
                    elements_data = metadata.get('elements', [])

                    # Deduplicate GUIDs in the incoming data (safety check)
                    seen_guids = set()
                    unique_elements = []
                    for elem in elements_data[:5000]:  # Limit to avoid huge requests
                        guid = elem.get('guid')
                        if guid and guid not in seen_guids:
                            seen_guids.add(guid)
                            unique_elements.append(elem)

                    # Bulk create entities (fast!)
                    entities_to_create = []
                    for elem in unique_elements:
                        entities_to_create.append(IFCEntity(
                            model=model,
                            ifc_guid=elem['guid'],
                            ifc_type=elem['type'],
                            name=elem.get('name'),
                            geometry_status='completed'
                        ))

                    if entities_to_create:
                        try:
                            created_entities = IFCEntity.objects.bulk_create(
                                entities_to_create,
                                ignore_conflicts=True,
                                batch_size=500  # Process in batches
                            )
                            entities_created_count = len(created_entities)
                            print(f"✅ Created {entities_created_count} entities from web-ifc metadata (requested: {len(entities_to_create)})")
                        except Exception as bulk_error:
                            # If bulk_create fails, try one-by-one with get_or_create
                            print(f"⚠️  Bulk create failed ({bulk_error}), falling back to individual inserts...")
                            for entity_data in entities_to_create:
                                try:
                                    IFCEntity.objects.get_or_create(
                                        model=model,
                                        ifc_guid=entity_data.ifc_guid,
                                        defaults={
                                            'ifc_type': entity_data.ifc_type,
                                            'name': entity_data.name,
                                            'geometry_status': entity_data.geometry_status
                                        }
                                    )
                                    entities_created_count += 1
                                except Exception as e:
                                    print(f"⚠️  Failed to create entity {entity_data.ifc_guid}: {e}")
                            print(f"✅ Created {entities_created_count} entities via fallback method")

                except Exception as e:
                    # Log but don't fail if entity creation fails
                    print(f"⚠️  Warning: Failed to create entities: {e}")
                    import traceback
                    traceback.print_exc()

            # Optional: Start background enrichment task
            # Query param: ?enrich=true (default: false)
            should_enrich = request.query_params.get('enrich', 'false').lower() == 'true'
            task_id = None

            if should_enrich:
                from django_q.tasks import async_task
                from .tasks import enrich_model_task

                task_id = async_task(
                    enrich_model_task,
                    str(model.id),
                    saved_path,
                    task_name=f'enrich_{model.name}_v{model.version_number}'
                )

                # Store task ID for tracking
                model.task_id = task_id
                model.save(update_fields=['task_id'])

                print(f"✅ Background enrichment task queued: {task_id}")

            # Return success response
            response_serializer = ModelDetailSerializer(model)
            return Response({
                'model': response_serializer.data,
                'file_url': model.file_url,  # Explicit file URL for immediate viewing
                'task_id': task_id,  # Background enrichment task ID (if enabled)
                'message': f'Model uploaded successfully (parsed by web-ifc). Status: {model.status}. ' +
                          (f'Background enrichment started.' if should_enrich else 'Ready to view!')
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Get processing status of a model.

        Returns model status plus Django Q task status if available.
        """
        model = self.get_object()

        response_data = {
            'id': str(model.id),
            'status': model.status,
            'element_count': model.element_count,
            'storey_count': model.storey_count,
            'system_count': model.system_count,
            'processing_error': model.processing_error,
            'updated_at': model.updated_at,
            'task_id': model.task_id,
        }

        # Add task status if available
        task_status = model.get_task_status()
        if task_status:
            response_data['task_state'] = task_status['state']
            response_data['task_info'] = task_status['info']
            response_data['task_ready'] = task_status['ready']
            response_data['task_successful'] = task_status['successful']
            response_data['task_failed'] = task_status['failed']

        return Response(response_data)

    @action(detail=True, methods=['get'])
    def file_url(self, request, pk=None):
        """
        Get signed URL for downloading the IFC file.

        GET /api/models/{id}/file_url/

        Returns:
            - file_url: Direct URL to download IFC file from Supabase Storage
            - file_size: Size in bytes
            - file_name: Original filename
            - expires_in: URL expiration time (if applicable)

        This URL can be used directly by the frontend to download and render
        the IFC file in the browser using IFC.js, bypassing backend processing.
        """
        model = self.get_object()

        if not model.file_url:
            return Response(
                {'error': 'File URL not available for this model'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'file_url': model.file_url,
            'file_size': model.file_size,
            'file_name': model.original_filename,
            'expires_in': 3600,  # Supabase signed URLs typically expire in 1 hour
        })

    @action(detail=True, methods=['get'])
    def elements(self, request, pk=None):
        """Get all elements for a model (paginated)."""
        model = self.get_object()
        from apps.entities.models import IFCEntity
        from apps.entities.serializers import IFCEntitySerializer

        entities = IFCEntity.objects.filter(model=model)

        # Apply filters if provided
        ifc_type = request.query_params.get('type')
        if ifc_type:
            entities = entities.filter(ifc_type=ifc_type)

        storey = request.query_params.get('storey')
        if storey:
            entities = entities.filter(storey_id=storey)

        # Paginate
        page = self.paginate_queryset(entities)
        if page is not None:
            serializer = IFCEntitySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = IFCEntitySerializer(entities, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """
        Get all versions of this model (same name, same project).

        GET /api/models/{id}/versions/

        Returns all versions sorted by version number (descending).
        Includes metadata comparison across versions.
        """
        model = self.get_object()

        # Get all versions with the same name in the same project
        versions = Model.objects.filter(
            project=model.project,
            name=model.name
        ).order_by('-version_number')

        # Serialize with basic info
        serializer = ModelSerializer(versions, many=True)

        return Response({
            'model_name': model.name,
            'project_id': str(model.project.id),
            'total_versions': versions.count(),
            'versions': serializer.data
        })

    @action(detail=True, methods=['get'])
    def compare(self, request, pk=None):
        """
        Compare this model with another version.

        GET /api/models/{id}/compare/?with={other_model_id}

        Returns metadata differences:
        - Element count changes
        - File size changes
        - Schema differences
        - Status comparison
        """
        model = self.get_object()
        other_id = request.query_params.get('with')

        if not other_id:
            return Response(
                {'error': 'Missing "with" parameter. Use: ?with={model_id}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            other_model = Model.objects.get(id=other_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'Model {other_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Build comparison
        comparison = {
            'from_model': {
                'id': str(model.id),
                'name': model.name,
                'version': model.version_number,
                'created_at': model.created_at,
                'element_count': model.element_count,
                'storey_count': model.storey_count,
                'system_count': model.system_count,
                'file_size': model.file_size,
                'ifc_schema': model.ifc_schema,
                'status': model.status,
            },
            'to_model': {
                'id': str(other_model.id),
                'name': other_model.name,
                'version': other_model.version_number,
                'created_at': other_model.created_at,
                'element_count': other_model.element_count,
                'storey_count': other_model.storey_count,
                'system_count': other_model.system_count,
                'file_size': other_model.file_size,
                'ifc_schema': other_model.ifc_schema,
                'status': other_model.status,
            },
            'differences': {
                'element_count_delta': other_model.element_count - model.element_count,
                'storey_count_delta': other_model.storey_count - model.storey_count,
                'system_count_delta': other_model.system_count - model.system_count,
                'file_size_delta': other_model.file_size - model.file_size,
                'file_size_delta_mb': round((other_model.file_size - model.file_size) / (1024 * 1024), 2),
                'schema_changed': model.ifc_schema != other_model.ifc_schema,
                'time_between': str(other_model.created_at - model.created_at),
            }
        }

        return Response(comparison)

    @action(detail=True, methods=['post'])
    def revert(self, request, pk=None):
        """
        Revert to this version by creating a new version from this model's file.

        POST /api/models/{id}/revert/

        Creates a new version (latest + 1) using the file from this version.
        This doesn't delete newer versions - it creates a new version as a copy.
        """
        old_model = self.get_object()

        if old_model.status != 'ready':
            return Response(
                {'error': f'Cannot revert to model with status "{old_model.status}". Only "ready" models can be reverted to.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find the latest version number for this model name
        latest_version = Model.objects.filter(
            project=old_model.project,
            name=old_model.name
        ).order_by('-version_number').first()

        new_version_number = (latest_version.version_number + 1) if latest_version else 1

        # Create new model entry pointing to the same file
        new_model = Model.objects.create(
            project=old_model.project,
            name=old_model.name,
            original_filename=f"{old_model.original_filename} (reverted from v{old_model.version_number})",
            file_url=old_model.file_url,  # Reuse same file
            file_size=old_model.file_size,
            version_number=new_version_number,
            parent_model=old_model,
            status='processing'  # Set to processing immediately
        )

        # Start async revert task with Django-Q
        task_id = async_task(revert_model_task, str(old_model.id), str(new_model.id))

        # Store task ID in new model
        new_model.task_id = task_id
        new_model.save(update_fields=['task_id'])

        print(f"✅ Revert task queued: {task_id}")

        # Return response immediately (don't wait for processing)
        response_serializer = ModelDetailSerializer(new_model)
        return Response({
            'model': response_serializer.data,
            'task_id': task_id,
            'message': f'Reverting to version {old_model.version_number}. Created new version {new_version_number}. Use GET /api/models/{new_model.id}/status/ to check progress.',
            'reverted_from': {
                'id': str(old_model.id),
                'version': old_model.version_number
            }
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def validation(self, request, pk=None):
        """
        Get the latest validation report for a model.

        GET /api/models/{id}/validation/

        Returns the most recent IFC validation report with:
        - Schema validation errors and warnings
        - GUID duplication issues
        - Geometry completeness
        - Property set completeness
        - LOD analysis
        """
        model = self.get_object()

        # Get latest validation report for this model
        validation_report = IFCValidationReport.objects.filter(model=model).first()

        if not validation_report:
            return Response({
                'error': 'No validation report found for this model',
                'message': 'Validation may still be in progress or failed during processing'
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = IFCValidationReportSerializer(validation_report)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish this version as the active version.

        POST /api/models/{id}/publish/

        This will:
        - Set this model's is_published to True
        - Unpublish all other versions with the same name in the same project
        - Only works if status is 'ready'

        The old published version remains accessible but is no longer active.
        """
        model = self.get_object()

        if model.status != 'ready':
            return Response({
                'error': f'Cannot publish model with status "{model.status}"',
                'message': 'Only models with status "ready" can be published. Please wait for processing to complete.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if model.is_published:
            return Response({
                'message': 'This version is already published',
                'model': ModelDetailSerializer(model).data
            })

        # Find currently published version
        currently_published = Model.objects.filter(
            project=model.project,
            name=model.name,
            is_published=True
        ).first()

        # Publish this version (will automatically unpublish others)
        success = model.publish()

        if not success:
            return Response({
                'error': 'Failed to publish model',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {
            'message': f'Version {model.version_number} published successfully',
            'model': ModelDetailSerializer(model).data
        }

        if currently_published:
            response_data['previous_published_version'] = {
                'id': str(currently_published.id),
                'version': currently_published.version_number,
                'name': currently_published.name
            }

        return Response(response_data)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        """
        Unpublish this version.

        POST /api/models/{id}/unpublish/

        This will set is_published to False. The version remains in the database
        but is no longer the active version.
        """
        model = self.get_object()

        if not model.is_published:
            return Response({
                'message': 'This version is not published',
                'model': ModelDetailSerializer(model).data
            })

        model.unpublish()

        return Response({
            'message': f'Version {model.version_number} unpublished successfully',
            'model': ModelDetailSerializer(model).data
        })

    @action(detail=True, methods=['get'])
    def delete_preview(self, request, pk=None):
        """
        Preview what will be deleted before actually deleting a model.

        GET /api/models/{id}/delete-preview/

        Returns:
        - Model information (name, version, status, is_published)
        - Count of child versions that will also be deleted
        - List of child versions
        - Entity count and file size
        - Warning messages if model is published or processing
        """
        model = self.get_object()

        # Get child versions (all models with this model as parent)
        child_versions = Model.objects.filter(parent_model=model).order_by('version_number')
        child_versions_data = [{
            'id': str(v.id),
            'version': v.version_number,
            'name': v.name,
            'status': v.status,
            'is_published': v.is_published,
            'element_count': v.element_count,
        } for v in child_versions]

        # Calculate total entities across this model and all children
        from apps.entities.models import IFCEntity
        total_entities = IFCEntity.objects.filter(model=model).count()
        for child in child_versions:
            total_entities += IFCEntity.objects.filter(model=child).count()

        # Calculate total file size
        total_file_size = model.file_size
        for child in child_versions:
            total_file_size += child.file_size

        # Build warnings
        warnings = []
        if model.status == 'processing':
            warnings.append('Model is currently being processed. Deletion is blocked.')
        if model.is_published:
            warnings.append('This is a published (active) version. Deleting it may affect users.')
        if child_versions.exists():
            warnings.append(f'Deleting this model will also delete {child_versions.count()} child version(s).')
        if any(v.is_published for v in child_versions):
            warnings.append('One or more child versions are published.')

        return Response({
            'model': {
                'id': str(model.id),
                'name': model.name,
                'version': model.version_number,
                'status': model.status,
                'is_published': model.is_published,
                'element_count': model.element_count,
                'file_size': model.file_size,
                'file_size_mb': round(model.file_size / (1024 * 1024), 2),
                'created_at': model.created_at,
            },
            'child_versions': {
                'count': child_versions.count(),
                'versions': child_versions_data,
            },
            'impact': {
                'total_models_deleted': 1 + child_versions.count(),
                'total_entities_deleted': total_entities,
                'total_file_size_deleted': total_file_size,
                'total_file_size_deleted_mb': round(total_file_size / (1024 * 1024), 2),
            },
            'warnings': warnings,
            'can_delete': model.status != 'processing',
            'deletion_note': 'This is a permanent operation. All data will be removed from the database.',
        })

    def destroy(self, request, *args, **kwargs):
        """
        Delete a model and clean up associated resources.

        DELETE /api/models/{id}/

        This will:
        - Delete the physical IFC file from storage
        - CASCADE delete this model and ALL child versions
        - CASCADE delete all related data (entities, geometry, properties, etc.)
        - This is a permanent operation that cannot be undone

        Returns 400 error if model is currently processing.
        """
        model = self.get_object()

        # HARD STOP: Block deletion if model is currently processing
        if model.status == 'processing':
            return Response({
                'error': 'Cannot delete model while processing',
                'message': 'Please wait for processing to complete or cancel the task first.',
                'status': model.status
            }, status=status.HTTP_400_BAD_REQUEST)

        # Get child versions count before deletion
        child_versions = Model.objects.filter(parent_model=model)
        child_count = child_versions.count()

        # Store model info for response
        model_info = {
            'id': str(model.id),
            'name': model.name,
            'version': model.version_number,
            'project': str(model.project.id),
            'is_published': model.is_published,
            'child_versions_deleted': child_count,
        }

        # Clean up file storage if file exists
        deleted_files = []
        if model.file_url:
            try:
                # Extract file path from URL
                # file_url format: /media/ifc_files/{project_id}/{filename}
                # or full URL for remote storage
                if model.file_url.startswith('/media/') or model.file_url.startswith('media/'):
                    # Local storage
                    file_path = model.file_url.replace('/media/', '', 1)
                    if default_storage.exists(file_path):
                        default_storage.delete(file_path)
                        deleted_files.append(file_path)
                        print(f"✅ Deleted file: {file_path}")
                # If using remote storage (Supabase), implement cleanup here
                # For now, skip remote file deletion to avoid accidental data loss
            except Exception as e:
                print(f"⚠️ Warning: Could not delete file {model.file_url}: {str(e)}")
                # Continue with model deletion even if file cleanup fails

        # Clean up child versions' files
        for child in child_versions:
            if child.file_url:
                try:
                    if child.file_url.startswith('/media/') or child.file_url.startswith('media/'):
                        file_path = child.file_url.replace('/media/', '', 1)
                        if default_storage.exists(file_path):
                            default_storage.delete(file_path)
                            deleted_files.append(file_path)
                            print(f"✅ Deleted child file: {file_path}")
                except Exception as e:
                    print(f"⚠️ Warning: Could not delete child file {child.file_url}: {str(e)}")

        # Perform the actual deletion (CASCADE deletes all related records)
        # This will automatically delete:
        # - All child versions (parent_model CASCADE)
        # - All entities for this model and children
        # - All geometry, properties, spatial hierarchy
        # - All validation reports, processing reports
        # - All viewer assignments, script executions
        model.delete()

        return Response({
            'message': f'Model "{model_info["name"]}" (v{model_info["version"]}) deleted successfully',
            'deleted_model': model_info,
            'deleted_files': deleted_files,
            'total_models_deleted': 1 + child_count,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def geometry(self, request, pk=None):
        """
        Get geometry data for all elements in this model.

        GET /api/models/{id}/geometry/

        Returns geometry in Three.js-compatible format:
        - vertices: flat array of [x,y,z, x,y,z, ...]
        - faces: flat array of vertex indices
        - colors: optional per-vertex colors
        """
        import numpy as np
        import io

        model = self.get_object()

        from apps.entities.models import IFCEntity, Geometry

        # Get all entities with geometry for this model
        entities = IFCEntity.objects.filter(model=model, has_geometry=True).select_related('geometry')

        print(f"\n{'='*60}")
        print(f"Geometry endpoint called for model: {model.name}")
        print(f"Total entities marked as has_geometry=True: {entities.count()}")
        print(f"{'='*60}\n")

        geometries = []
        skipped_no_data = 0
        skipped_errors = 0

        for entity in entities:
            try:
                geom = entity.geometry

                # Get raw bytes (using simplified if available, otherwise original)
                if geom.vertices_simplified:
                    vertices_bytes = geom.vertices_simplified
                elif geom.vertices_original:
                    vertices_bytes = geom.vertices_original
                else:
                    skipped_no_data += 1
                    print(f"  Skipping {entity.ifc_guid}: No vertex data")
                    continue

                # Get face bytes
                if geom.faces_simplified:
                    faces_bytes = geom.faces_simplified
                elif geom.faces_original:
                    faces_bytes = geom.faces_original
                else:
                    skipped_no_data += 1
                    print(f"  Skipping {entity.ifc_guid}: No face data")
                    continue

                # Reconstruct numpy arrays from raw bytes
                # Geometry is stored as vertices.tobytes() and faces.tobytes()
                # vertices shape: (vertex_count, 3) - float64
                # faces shape: (triangle_count, 3) - int32 or int64

                vertex_count = entity.vertex_count
                triangle_count = entity.triangle_count

                # Reconstruct vertices array
                vertices = np.frombuffer(vertices_bytes, dtype=np.float64).reshape(vertex_count, 3)

                # Transform from IFC Z-up to Three.js Y-up
                # Rotate -90° around X-axis: (x, y, z) -> (x, z, -y)
                vertices_transformed = np.zeros_like(vertices)
                vertices_transformed[:, 0] = vertices[:, 0]  # X stays the same
                vertices_transformed[:, 1] = vertices[:, 2]  # Z becomes Y (up)
                vertices_transformed[:, 2] = -vertices[:, 1]  # -Y becomes Z (forward)
                vertices = vertices_transformed

                # Try int32 first, if size doesn't match try int64
                expected_face_size_int32 = triangle_count * 3 * 4  # 3 indices * 4 bytes
                expected_face_size_int64 = triangle_count * 3 * 8  # 3 indices * 8 bytes

                if len(faces_bytes) == expected_face_size_int32:
                    faces = np.frombuffer(faces_bytes, dtype=np.int32).reshape(triangle_count, 3)
                elif len(faces_bytes) == expected_face_size_int64:
                    faces = np.frombuffer(faces_bytes, dtype=np.int64).reshape(triangle_count, 3)
                else:
                    print(f"Warning: Unexpected face data size for {entity.ifc_guid}")
                    continue

                # Convert to lists for JSON serialization
                geometries.append({
                    'entity_id': str(entity.id),
                    'ifc_guid': entity.ifc_guid,
                    'ifc_type': entity.ifc_type,
                    'name': entity.name,
                    'vertices': vertices.flatten().tolist(),  # [x,y,z, x,y,z, ...]
                    'faces': faces.flatten().tolist(),  # [i,j,k, i,j,k, ...]
                    'vertex_count': len(vertices),
                    'triangle_count': len(faces),
                })

            except Exception as e:
                # Skip entities with invalid geometry
                skipped_errors += 1
                print(f"Warning: Could not load geometry for entity {entity.ifc_guid}: {str(e)}")
                continue

        print(f"\n{'='*60}")
        print(f"Geometry loading summary:")
        print(f"  Successfully loaded: {len(geometries)}")
        print(f"  Skipped (no data): {skipped_no_data}")
        print(f"  Skipped (errors): {skipped_errors}")
        print(f"  Total queried: {entities.count()}")
        print(f"{'='*60}\n")

        return Response({
            'model_id': str(model.id),
            'model_name': model.name,
            'geometry_count': len(geometries),
            'geometries': geometries
        })

    @action(detail=True, methods=['post'])
    def generate_fragments(self, request, pk=None):
        """
        Generate ThatOpen Fragments file for this model.

        POST /api/models/{id}/generate_fragments/

        Response:
            - success: bool
            - fragments_url: URL to fragments file
            - size_mb: File size in MB
            - element_count: Number of elements

        Note: This is an async operation. It may take 10-60 seconds for large models.
        The fragments_url will be stored in the model and can be retrieved later
        via GET /api/models/{id}/fragments/
        """
        from .services.fragments import generate_fragments_for_model

        model = self.get_object()

        # Check if IFC file exists
        if not model.file_url:
            return Response(
                {'error': 'No IFC file uploaded. Cannot generate fragments.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Generate fragments (this may take a while)
            result = generate_fragments_for_model(str(model.id))

            return Response({
                'success': True,
                'fragments_url': result['fragments_url'],
                'size_mb': result['size_mb'],
                'element_count': result['element_count']
            })

        except FileNotFoundError as e:
            return Response(
                {'error': f'File not found: {str(e)}'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to generate fragments: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def fragments(self, request, pk=None):
        """
        Get Fragments file URL for direct loading.

        GET /api/models/{id}/fragments/

        Response:
            - fragments_url: URL to fragments file (for direct download)
            - size_mb: File size in MB
            - generated_at: Timestamp when generated

        If no fragments available, returns 404.
        Frontend can then fallback to loading IFC file directly.
        """
        model = self.get_object()

        if not model.fragments_url:
            return Response(
                {
                    'error': 'No Fragments file available. Generate first via POST /api/models/{id}/generate_fragments/',
                    'has_ifc': bool(model.file_url)
                },
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'fragments_url': model.fragments_url,
            'size_mb': model.fragments_size_mb,
            'generated_at': model.fragments_generated_at
        })

    @action(detail=True, methods=['delete'])
    def delete_fragments(self, request, pk=None):
        """
        Delete Fragments file for this model.

        DELETE /api/models/{id}/delete_fragments/

        Response:
            - success: bool
            - message: Success message

        Note: This does NOT delete the IFC file, only the Fragments cache.
        Fragments can be regenerated later.
        """
        from .services.fragments import delete_fragments_for_model

        model = self.get_object()

        if not model.fragments_url:
            return Response(
                {'error': 'No fragments to delete'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            delete_fragments_for_model(str(model.id))

            return Response({
                'success': True,
                'message': 'Fragments deleted successfully'
            })

        except Exception as e:
            return Response(
                {'error': f'Failed to delete fragments: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
