from django.urls import path

from .views import embed_capabilities, embed_instances


urlpatterns = [
    path('capabilities/', embed_capabilities, name='embed-capabilities'),
    path('instances/', embed_instances, name='embed-instances'),
]
