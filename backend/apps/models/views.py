from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
from pathlib import Path

from .models import Model
from .serializers import (
    ModelSerializer,
    ModelDetailSerializer,
    ModelUploadSerializer,
    IFCValidationReportSerializer
)
from apps.projects.models import Project
from apps.entities.models import IFCValidationReport


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
            - name: Optional model name
            - version_number: Optional version number

        Response:
            - model: Created model object
            - message: Success message
        """
        serializer = ModelUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data['file']
        project_id = serializer.validated_data['project_id']
        name = serializer.validated_data.get('name', Path(uploaded_file.name).stem)
        version_number = serializer.validated_data.get('version_number')

        # Get project
        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': f'Project {project_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Auto-increment version number if not provided
        if version_number is None:
            latest_version = Model.objects.filter(project=project).order_by('-version_number').first()
            version_number = (latest_version.version_number + 1) if latest_version else 1

        # Check if version already exists
        if Model.objects.filter(project=project, version_number=version_number).exists():
            return Response(
                {'error': f'Version {version_number} already exists for this project'},
                status=status.HTTP_400_BAD_REQUEST
            )

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
            status='uploading'
        )

        # TODO: Trigger IFC processing (will use Celery later)
        # For now, we'll process synchronously for testing
        try:
            # Import the processing function
            from .services import process_ifc_file

            # Update status to processing
            model.status = 'processing'
            model.save()

            # Process the file
            full_path = default_storage.path(saved_path)
            result = process_ifc_file(model.id, full_path)

            # Update model with results
            model.status = 'ready'
            model.ifc_schema = result.get('ifc_schema', '')
            model.element_count = result.get('element_count', 0)
            model.storey_count = result.get('storey_count', 0)
            model.system_count = result.get('system_count', 0)
            model.save()

            message = f"File uploaded and processed successfully. {result.get('element_count', 0)} elements extracted."

        except Exception as e:
            # Mark as error if processing fails
            model.status = 'error'
            model.processing_error = str(e)
            model.save()

            message = f"File uploaded but processing failed: {str(e)}"

        # Return response
        response_serializer = ModelDetailSerializer(model)
        return Response({
            'model': response_serializer.data,
            'message': message
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
