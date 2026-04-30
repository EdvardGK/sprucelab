from django.urls import path

from .views import admin_dashboard, admin_approve_user, admin_reject_user

urlpatterns = [
    path('dashboard/', admin_dashboard, name='admin-dashboard'),
    path('users/<int:user_id>/approve/', admin_approve_user, name='admin-approve-user'),
    path('users/<int:user_id>/reject/', admin_reject_user, name='admin-reject-user'),
]
