from django.urls import path

from .admin_views import tokens_collection, tokens_detail, tokens_refresh
from .views import embed_capabilities, embed_instances


urlpatterns = [
    path('capabilities/', embed_capabilities, name='embed-capabilities'),
    path('instances/', embed_instances, name='embed-instances'),

    # Token lifecycle (admin endpoints + token-authenticated refresh)
    path('tokens/', tokens_collection, name='embed-tokens-collection'),
    path('tokens/refresh/', tokens_refresh, name='embed-tokens-refresh'),
    path('tokens/<str:token_id>/', tokens_detail, name='embed-tokens-detail'),
]
