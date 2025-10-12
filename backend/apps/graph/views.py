from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count

from apps.entities.models import IFCEntity, GraphEdge
from apps.models.models import Model


class GraphViewSet(viewsets.ViewSet):
    """
    API endpoints for graph data (nodes and edges).

    Used for force-directed graph visualization.
    """

    @action(detail=False, methods=['get'], url_path=r'(?P<model_id>[^/.]+)/nodes')
    def nodes(self, request, model_id=None):
        """
        Get all nodes (entities) for a model.

        GET /api/graph/{model_id}/nodes/

        Returns:
            - id: Entity UUID
            - ifc_guid: IFC GlobalId
            - ifc_type: Element type
            - name: Element name
            - has_geometry: Boolean
            - in_degree: Number of incoming edges
            - out_degree: Number of outgoing edges
        """
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'Model {model_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get all entities for this model
        entities = IFCEntity.objects.filter(model=model)

        # Count edges for each entity
        entities_with_degrees = entities.annotate(
            in_degree=Count('incoming_edges'),
            out_degree=Count('outgoing_edges')
        )

        # Build node list
        nodes = []
        for entity in entities_with_degrees:
            nodes.append({
                'id': str(entity.id),
                'ifc_guid': entity.ifc_guid,
                'ifc_type': entity.ifc_type,
                'name': entity.name or '',
                'has_geometry': entity.has_geometry,
                'in_degree': entity.in_degree,
                'out_degree': entity.out_degree,
            })

        return Response({
            'model_id': str(model.id),
            'model_name': model.name,
            'node_count': len(nodes),
            'nodes': nodes
        })

    @action(detail=False, methods=['get'], url_path=r'(?P<model_id>[^/.]+)/edges')
    def edges(self, request, model_id=None):
        """
        Get all edges (relationships) for a model.

        GET /api/graph/{model_id}/edges/

        Query params:
            - relationship_type: Filter by relationship type

        Returns:
            - id: Edge UUID
            - source: Source entity UUID
            - target: Target entity UUID
            - relationship_type: Type of relationship
            - properties: Additional metadata
        """
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'Model {model_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get all edges for this model
        edges_qs = GraphEdge.objects.filter(model=model).select_related(
            'source_entity', 'target_entity'
        )

        # Filter by relationship type if provided
        relationship_type = request.query_params.get('relationship_type')
        if relationship_type:
            edges_qs = edges_qs.filter(relationship_type=relationship_type)

        # Build edge list
        edges = []
        for edge in edges_qs:
            edges.append({
                'id': str(edge.id),
                'source': str(edge.source_entity.id),
                'target': str(edge.target_entity.id),
                'relationship_type': edge.relationship_type,
                'properties': edge.properties,
            })

        return Response({
            'model_id': str(model.id),
            'model_name': model.name,
            'edge_count': len(edges),
            'edges': edges
        })

    @action(detail=False, methods=['get'], url_path=r'(?P<model_id>[^/.]+)/statistics')
    def statistics(self, request, model_id=None):
        """
        Get graph statistics for a model.

        GET /api/graph/{model_id}/statistics/

        Returns statistics about the graph structure.
        """
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'Model {model_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Count nodes
        node_count = IFCEntity.objects.filter(model=model).count()

        # Count edges by type
        edges_by_type = GraphEdge.objects.filter(model=model).values(
            'relationship_type'
        ).annotate(count=Count('id')).order_by('-count')

        # Total edge count
        total_edges = sum(item['count'] for item in edges_by_type)

        # Count nodes with geometry
        nodes_with_geometry = IFCEntity.objects.filter(
            model=model, has_geometry=True
        ).count()

        # Find nodes with most connections
        most_connected = IFCEntity.objects.filter(model=model).annotate(
            total_degree=Count('incoming_edges') + Count('outgoing_edges')
        ).order_by('-total_degree')[:10]

        top_nodes = [
            {
                'id': str(node.id),
                'name': node.name or node.ifc_guid,
                'ifc_type': node.ifc_type,
                'total_degree': node.total_degree
            }
            for node in most_connected
        ]

        return Response({
            'model_id': str(model.id),
            'model_name': model.name,
            'node_count': node_count,
            'edge_count': total_edges,
            'nodes_with_geometry': nodes_with_geometry,
            'edges_by_type': list(edges_by_type),
            'most_connected_nodes': top_nodes,
        })

    @action(detail=False, methods=['get'], url_path=r'(?P<model_id>[^/.]+)/full')
    def full_graph(self, request, model_id=None):
        """
        Get complete graph data (nodes + edges) in one request.

        GET /api/graph/{model_id}/full/

        Returns both nodes and edges for visualization.
        Warning: May be large for big models!
        """
        try:
            model = Model.objects.get(id=model_id)
        except Model.DoesNotExist:
            return Response(
                {'error': f'Model {model_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get nodes
        nodes_response = self.nodes(request, model_id)
        nodes_data = nodes_response.data

        # Get edges
        edges_response = self.edges(request, model_id)
        edges_data = edges_response.data

        return Response({
            'model_id': str(model.id),
            'model_name': model.name,
            'nodes': nodes_data['nodes'],
            'edges': edges_data['edges'],
            'node_count': nodes_data['node_count'],
            'edge_count': edges_data['edge_count'],
        })
