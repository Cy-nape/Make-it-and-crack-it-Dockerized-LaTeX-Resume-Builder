FROM python:3.11-slim-bookworm AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3001

# Install TeX Live and clean up apt cache
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-fonts-recommended \
      texlive-fonts-extra \
      texlive-latex-extra \
      texlive-science \
      lmodern \
      curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --create-home app

# Create virtualenv and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the model into the image during build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# --- Dev Stage ---
FROM base AS dev
WORKDIR /app

USER root
# Install watchdog for Flask auto-reload
RUN pip install --no-cache-dir watchdog

USER app
# Flask development server
CMD ["flask", "run", "--host=0.0.0.0", "--port=3001", "--debug"]

# --- Runtime Stage ---
FROM base AS runtime
WORKDIR /app

# Copy application code and fine-tuned model
COPY --chown=app:app app.py .
COPY --chown=app:app finetuned-resume-model/ ./finetuned-resume-model/

# Switch to non-root user
USER app

# Render sets the PORT environment variable dynamically. 
# We use sh -c to expand it, or default to 3001 if it's not set.
CMD sh -c "gunicorn --bind 0.0.0.0:${PORT:-3001} --workers 2 --timeout 120 --reload app:app"
