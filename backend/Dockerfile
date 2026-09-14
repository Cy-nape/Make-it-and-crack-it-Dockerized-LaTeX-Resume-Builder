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

# --- Runtime Stage ---
FROM base AS runtime
WORKDIR /app

# Copy application code
COPY app.py .

# Switch to non-root user
USER app
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3001/health || exit 1

# Run with Gunicorn in production
CMD ["gunicorn", "--bind", "0.0.0.0:3001", "--workers", "2", "--timeout", "30", "app:app"]

# --- Dev Stage ---
FROM base AS dev
WORKDIR /app

USER root
# Install watchdog for Flask auto-reload
RUN pip install --no-cache-dir watchdog

USER app
# Flask development server
CMD ["flask", "run", "--host=0.0.0.0", "--port=3001", "--debug"]
