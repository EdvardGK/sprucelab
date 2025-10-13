from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
from pathlib import Path
import threading

from .models import Model
from .serializers import (
    ModelSerializer,
    ModelDetailSerializer,
    ModelUploadSerializer,
    IFCValidationReportSerializer
)
from apps.projects.models import Project
from apps.entities.models import IFCValidationReport


def process_ifc_in_background(model_id, file_path):
    """
    Process IFC file in background thread.

    Args:
        model_id: UUID of the Model instance
        file_path: Full path to the IFC file
    """
    from .services import process_ifc_file

    try:
        # Get model instance
        model = Model.objects.get(id=model_id)

        # Update status to processing
        model.status = 'processing'
        model.save()

        print(f"\n🔄 Starting background processing for model {model.name} (v{model.version_number})...")

        # Process the file
        result = process_ifc_file(model_id, file_path)

        # Update model with results
        model.status = 'ready'
        model.ifc_schema = result.get('ifc_schema', '')
        model.element_count = result.get('element_count', 0)
        model.storey_count = result.get('storey_count', 0)
        model.system_count = result.get('system_count', 0)
        model.save()

        print(f"✅ Background processing complete for model {model.name} (v{model.version_number})")

    except Exception as e:
        # Mark as error if processing fails
        try:
            model = Model.objects.get(id=model_id)
            model.status = 'error'
            model.processing_error = str(e)
            model.save()
            print(f"❌ Background processing failed for model {model_id}: {str(e)}")
        except Exception as inner_e:
            print(f"❌ Critical error in background processing: {str(inner_e)}")


class ModelViewSet(viewsets.ModelViewSet):
    """
    API endpoint for IFC models.

    list: Get all models
    create: Create a new model (use upload action instead)
    retrieve: Get a single model with details
    update: Update a model
    partial_update: Partially update a model
    destroy: Delete a model
    upload: Upload an IFC file
    """
    queryset = Model.objects.all()
    serializer_class = ModelSerializer

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

        # Start background processing
        full_path = default_storage.path(saved_path)
        processing_thread = threading.Thread(
            target=process_ifc_in_background,
            args=(model.id, full_path),
            daemon=True  # Daemon thread so it doesn't block shutdown
        )
        processing_thread.start()

        # Return response immediately (don't wait for processing)
        response_serializer = ModelDetailSerializer(model)
        return Response({
            'model': response_serializer.data,
            'message': f'File uploaded successfully. Processing started in background. Use GET /api/models/{model.id}/status/ to check progress.'
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """Get processing status of a model."""
        model = self.get_object()
        return Response({
            'id': str(model.id),
            'status': model.status,
            'element_count': model.element_count,
            'storey_count': model.storey_count,
            'system_count': model.system_count,
            'processing_error': model.processing_error,
            'updated_at': model.updated_at
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
            status='uploading'
        )

        # Re-process the file
        try:
            from .services import process_ifc_file

            new_model.status = 'processing'
            new_model.save()

            # Process the file
            full_path = default_storage.path(old_model.file_url.replace('/media/', ''))
            result = process_ifc_file(new_model.id, full_path)

            # Update model with results
            new_model.status = 'ready'
            new_model.ifc_schema = result.get('ifc_schema', '')
            new_model.element_count = result.get('element_count', 0)
            new_model.storey_count = result.get('storey_count', 0)
            new_model.system_count = result.get('system_count', 0)
            new_model.save()

            message = f"Reverted to version {old_model.version_number}. Created new version {new_version_number}."

        except Exception as e:
            new_model.status = 'error'
            new_model.processing_error = str(e)
            new_model.save()

            message = f"Revert failed: {str(e)}"

        # Return response
        response_serializer = ModelDetailSerializer(new_model)
        return Response({
            'model': response_serializer.data,
            'message': message,
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
