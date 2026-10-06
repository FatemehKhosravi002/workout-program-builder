import csv
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from exercises.models import Category, Exercise


class Command(BaseCommand):
    help = "Import categories and exercises from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)

    def handle(self, *args, **options):
        csv_path = Path(options["csv_file"])

        if not csv_path.exists():
            raise CommandError(f"File not found: {csv_path}")

        created_categories = 0
        created_exercises = 0

        with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)

            required = {"category", "exercise"}

            if not required.issubset(reader.fieldnames or []):
                raise CommandError("CSV must have category,exercise columns.")

            for row in reader:
                category_name = row["category"].strip()
                exercise_name = row["exercise"].strip()

                if not category_name or not exercise_name:
                    continue

                category, category_created = Category.objects.get_or_create(
                    name=category_name
                )

                if category_created:
                    created_categories += 1

                _, exercise_created = Exercise.objects.get_or_create(
                    name=exercise_name,
                    category=category,
                )

                if exercise_created:
                    created_exercises += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {created_categories} categories and "
                f"{created_exercises} exercises."
            )
        )
