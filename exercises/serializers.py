from rest_framework import serializers
from .models import Category, Exercise


class CategorySerializer(serializers.ModelSerializer):
    exercise_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "exercise_count"]


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = ["id", "name", "category"]
