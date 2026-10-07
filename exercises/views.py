import io
import os

import arabic_reshaper
from bidi.algorithm import get_display

from django.db.models import Count
from django.conf import settings
from django.http import FileResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from rest_framework.generics import ListAPIView, CreateAPIView

from .models import Category, Exercise
from .serializers import CategorySerializer, ExerciseSerializer


@ensure_csrf_cookie
def home(request):
    return render(request, "exercises/home.html")


class CategoryListView(ListAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.annotate(
            exercise_count=Count("exercises")
        )


class ExerciseListView(ListAPIView):
    serializer_class = ExerciseSerializer

    def get_queryset(self):
        category_id = self.request.query_params.get("category")

        if category_id:
            return Exercise.objects.filter(category_id=category_id)

        return Exercise.objects.all()


class ExerciseCreateView(CreateAPIView):
    queryset = Exercise.objects.all()
    serializer_class = ExerciseSerializer


class CategoryCreateView(CreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


def reshape_persian(text):
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)


def generate_pdf(request):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST method is allowed."}, status=405)

    data = request.POST

    name = data.get("name", "").strip()

    number_of_days = int(data.get("number_of_days", 2))

    if not name:
        return JsonResponse({"error": "نام الزامی است."}, status=400)

    buffer = io.BytesIO()

    font_path = os.path.join(
        settings.BASE_DIR, "exercises", "fonts", "Vazirmatn-Regular.ttf"
    )

    pdfmetrics.registerFont(TTFont("Vazirmatn", font_path))

    pdf = canvas.Canvas(buffer, pagesize=A4)

    width, height = A4

    # -----------------------------
    # عنوان
    # -----------------------------

    pdf.setFont("Vazirmatn", 20)

    title = reshape_persian(f"برنامه تمرینی {name}")

    pdf.drawCentredString(width / 2, height - 60, title)

    y = height - 110

    # -----------------------------
    # روزها
    # -----------------------------

    for day in range(1, number_of_days + 1):
        exercises = request.POST.getlist(f"day_{day}[]")

        # عنوان روز

        pdf.setFont("Vazirmatn", 16)

        day_title = reshape_persian(f"روز {day}")

        pdf.drawRightString(width - 50, y, day_title)

        y -= 35

        # -------------------------
        # بدون تمرین
        # -------------------------

        if not exercises:
            pdf.setFont("Vazirmatn", 12)

            empty_text = reshape_persian("هنوز تمرینی انتخاب نشده است.")

            pdf.drawRightString(width - 70, y, empty_text)

            y -= 30

        else:
            # ---------------------
            # تمرین‌ها
            # ---------------------

            pdf.setFont("Vazirmatn", 12)

            for index, exercise in enumerate(exercises, start=1):
                # اگر حرکت سوپرست باشد
                # از home.html با * فرستاده می‌شود
                text = reshape_persian(f"{index}. {exercise}")

                pdf.drawRightString(width - 70, y, text)

                y -= 28

                # رفتن به صفحه بعد

                if y < 60:
                    pdf.showPage()

                    pdf.setFont("Vazirmatn", 12)

                    y = height - 60

        y -= 20

    # -----------------------------
    # ذخیره PDF
    # -----------------------------

    pdf.save()

    buffer.seek(0)

    # -----------------------------
    # نام فایل
    # -----------------------------

    safe_name = "".join(char for char in name if char not in '\\/:*?"<>|')

    return FileResponse(
        buffer,
        as_attachment=True,
        filename=f"{safe_name}.pdf",
        content_type="application/pdf",
    )
