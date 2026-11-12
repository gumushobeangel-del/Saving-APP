import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-for-deployment")

from .settings import *


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
