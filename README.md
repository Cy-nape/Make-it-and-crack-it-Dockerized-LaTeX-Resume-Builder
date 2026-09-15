# Resume Builder

Resume Builder is a containerized web application designed to demonstrate the power of Docker in managing complex system dependencies. By encapsulating the notoriously heavy TeX Live distribution within an isolated backend container, Resume Builder allows users to compile LaTeX resumes directly from their browser without installing a single TeX package on their host machine.

## Architectural Philosophy

The core of Resume Builder is a strict separation of concerns, orchestrated through Docker Compose. The resume editor acts as the interactive surface, while the containerized compilation workflow handles the heavy lifting.

```text
Browser (http://localhost:8080)
            |
            v
Frontend container: Nginx + compiled React SPA
            |  /api/latex/compile
            v
Backend container: Flask + pdflatex + TeX Live
            |
            v
Ephemeral compile directory -> PDF response -> cleaned up
```

- The Frontend is a React Single Page Application (SPA) served by Nginx. It handles the editor state, templates, and PDF rendering.
- The Backend is a lightweight Python/Flask API. Its only job is to receive LaTeX strings, securely orchestrate the `pdflatex` binary in a temporary workspace, and return the generated PDF.

## Engineering Highlights

- Multi-stage Docker Builds: The React frontend is compiled in a temporary Node.js stage, ensuring the final Nginx image is lean and production-ready.
- Dependency Isolation: The Python backend image bundles a carefully selected subset of TeX Live, completely shielding the host system from gigabytes of LaTeX dependencies.
- Secure Compilation: The Flask API executes `pdflatex` as a non-root user with shell escapes disabled. Every compilation request is isolated in a unique temporary directory, strictly time-boxed, and rigorously cleaned up regardless of success or failure.
- Zero-Configuration Routing: Nginx seamlessly serves the static frontend while proxying `/api/*` traffic to the backend, avoiding complex CORS setups in production.

## Running the Application

Prerequisite: Docker Desktop must be installed and running on your machine.

To spin up the entire production-ready stack:

```bash
docker compose up --build
```

Navigate to http://localhost:8080 in your browser. Select a template, modify the LaTeX source, and watch the PDF compile natively inside the container.

Useful management commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose exec backend pdflatex --version
docker compose down
```

## Local Development

If you prefer to run the application locally outside of Docker, you must have Python 3 and a working TeX distribution (`pdflatex`) installed on your system path.

Frontend (Vite):
```bash
cd frontend
npm install
VITE_API_URL="http://localhost:3001" npm run dev
```

Backend (Flask):
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
flask run --port=3001 --debug
```

For containerized development with hot-reloading enabled, use the provided development compose file:
```bash
docker compose -f docker-compose.dev.yml up --build
```

## Project Layout

```text
backend/
  Dockerfile              Flask API + TeX Live environment
  app.py                  Isolated LaTeX compilation endpoint and web server
  requirements.txt        Python dependencies
frontend/
  Dockerfile              React build stage + Nginx runtime
  nginx.conf              Static file serving and API reverse proxy
  public/templates/       Resume templates and metadata
docker-compose.yml        Two-container production stack
docker-compose.dev.yml    Development stack with hot-reloading
```

## Project Scope

Resume Builder is intentionally focused on robust compilation and containerization. It actively avoids features like user authentication, database persistence, and AI generation to remain a pure, easily understandable reference architecture for Dockerized application development.
