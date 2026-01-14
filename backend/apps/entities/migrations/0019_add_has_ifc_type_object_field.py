# Generated manually for ObjectType-primary type enumeration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0018_add_instance_count_to_ifctype'),
    ]

    operations = [
        # Increase type_guid max_length to accommodate synthetic GUIDs
        migrations.AlterField(
            model_name='ifctype',
            name='type_guid',
            field=models.CharField(
                max_length=50,
                help_text='IFC GlobalId or synthetic hash for types without IfcTypeObject'
            ),
        ),
        # Add has_ifc_type_object field
        migrations.AddField(
            model_name='ifctype',
            name='has_ifc_type_object',
            field=models.BooleanField(
                default=True,
                help_text='True if backed by IfcTypeObject, False if synthetic from ObjectType'
            ),
        ),
    ]
