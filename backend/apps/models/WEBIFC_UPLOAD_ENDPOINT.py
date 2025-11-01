"""
Web-IFC Upload Endpoint

This endpoint receives pre-parsed metadata from the frontend (web-ifc)
and stores it WITHOUT parsing on the backend.

Add this to your views.py:
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.core.files.storage import default_storage
from apps.models.models import Model
from apps.entities.models import IFCEntity
import json


@api_view(['POST'])
def upload_model_with_metadata(request):
    """
    Upload IFC model with pre-parsed metadata from web-ifc.

    NO BACKEND PARSING! Frontend already parsed with web-ifc.

    Request:
        - file: IFC file (multipart)
        - project_id: UUID
        - name: Model name
        - version_number: int
        - ifc_schema: string (IFC2X3, IFC4, etc.)
        - element_count: int
        - storey_count: int
        - system_count: int
        - metadata: JSON string (optional: full element list)

    Returns:
        - model_id: UUID
        - file_url: Storage URL
    """
    try:
        # Get file and basic info
        file = request.FILES.get('file')
        project_id = request.data.get('project_id')
        name = request.data.get('name')
        version_number = int(request.data.get('version_number', 1))

        # Get pre-parsed metadata from frontend
        ifc_schema = request.data.get('ifc_schema')
        element_count = int(request.data.get('element_count', 0))
        storey_count = int(request.data.get('storey_count', 0))
        system_count = int(request.data.get('system_count', 0))

        if not all([file, project_id, name]):
            return Response(
                {'error': 'Missing required fields'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Save file to storage (Supabase or local)
        file_path = f'models/{project_id}/{file.name}'
        saved_path = default_storage.save(file_path, file)
        file_url = default_storage.url(saved_path)

        # Create model record with pre-parsed metadata
        model = Model.objects.create(
            project_id=project_id,
            name=name,
            original_filename=file.name,
            version_number=version_number,
            file_url=file_url,
            file_size=file.size,
            ifc_schema=ifc_schema,
            element_count=element_count,
            storey_count=storey_count,
            system_count=system_count,
            # IMPORTANT: Mark as already parsed!
            parsing_status='parsed',  # Frontend already parsed
            geometry_status='completed',  # Frontend has geometry
            validation_status='pending',  # Can validate later if needed
            status='ready'  # Model is ready to use!
        )

        # Optionally: Store entities from metadata
        metadata_json = request.data.get('metadata')
        if metadata_json:
            try:
                metadata = json.loads(metadata_json)
                elements_data = metadata.get('elements', [])

                # Bulk create entities (fast!)
                entities_to_create = []
                for elem in elements_data[:1000]:  # Limit to 1000 for now
                    entities_to_create.append(IFCEntity(
                        model=model,
                        ifc_guid=elem['guid'],
                        ifc_type=elem['type'],
                        name=elem.get('name'),
                        geometry_status='completed'  # Frontend has it
                    ))

                IFCEntity.objects.bulk_create(
                    entities_to_create,
                    ignore_conflicts=True  # Skip duplicates
                )

            except Exception as e:
                # Log but don't fail if entity creation fails
                print(f"Warning: Failed to create entities: {e}")

        return Response({
            'model_id': str(model.id),
            'file_url': file_url,
            'message': 'Model uploaded successfully (parsed by web-ifc)'
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


"""
INSTALLATION INSTRUCTIONS:

1. Add to apps/models/views.py:

from .WEBIFC_UPLOAD_ENDPOINT import upload_model_with_metadata

2. Add to apps/models/urls.py:

urlpatterns = [
    ...
    path('upload-with-metadata/', upload_model_with_metadata, name='upload-with-metadata'),
]

3. Test:
   - Upload a file via the Web-IFC upload dialog
   - Should create model with status='ready' immediately
   - No backend parsing needed!
"""
