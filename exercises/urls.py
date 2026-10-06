from django.urls import path

from .views import (
    home,
    CategoryListView,
    ExerciseListView,
    ExerciseCreateView,
    CategoryCreateView,
    generate_pdf,
)


urlpatterns = [
    path("", home),
    path("api/categories/", CategoryListView.as_view()),
    path("api/categories/create/", CategoryCreateView.as_view()),
    path("api/exercises/", ExerciseListView.as_view()),
    path("api/exercises/create/", ExerciseCreateView.as_view()),
    path("api/generate-pdf/", generate_pdf),
]
