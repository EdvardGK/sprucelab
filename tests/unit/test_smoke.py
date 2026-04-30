"""Trivial smoke test — just confirms pytest + Django settings load."""
import pytest


def test_pytest_runs():
    assert 1 + 1 == 2


def test_django_settings_loaded():
    from django.conf import settings
    assert settings.SECRET_KEY  # any value is fine — proves settings module imported


@pytest.mark.django_db
def test_db_round_trip():
    from apps.projects.models import Project
    p = Project.objects.create(name="smoke", description="harness check")
    assert Project.objects.get(pk=p.pk).name == "smoke"
