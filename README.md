# Make it and crack it — Dockerized LaTeX Resume Builder

Make it and crack it is a deliberately small web application built to Undestand Docker. It turns LaTeX resume source into a PDF in a container, removing the need to install and configure TeX Live on the host machine.

The resume editor is the demo surface; the containerized compilation workflow is the project.

## What it demonstrates

- **Multi-stage Docker builds**: TypeScript and React are built in temporary stages; production images include only what they need at runtime.
- **Complex system dependencies**: the API image bundles TeX Live and fonts alongside a Node.js service.
- **Multi-container orchestration**: Docker Compose runs a frontend and backend on an isolated default network.
- **Reverse proxying**: Nginx serves the production React build and forwards `/api/*` only to the backend service.
- **Health checks and startup ordering**: the frontend waits for the API to pass its health check.
- **Container hardening**: the compiler runs as a non-root user; shell escape is disabled; each compilation uses a new temporary directory, a time limit, bounded logs, and cleanup.
- **Build hygiene**: `.dockerignore` files keep development output and secrets out of build contexts.

## Architecture

```text
Browser (http://localhost:8080)
            |
            v
Frontend container: Nginx + compiled React SPA
            |  /api/latex/compile
            v
Backend container: Express + pdflatex + TeX Live
            |
            v
Temporary compile directory -> PDF response -> cleaned up
```

The backend is not published to the host. Only Nginx exposes a port, and Compose networking lets it reach the backend by its service name (`backend`).

## Run with Docker

Prerequisite: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). Choose a template, edit its LaTeX, and the PDF preview is compiled by TeX Live inside the backend container.

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose exec backend pdflatex --version
docker compose down
```

## Features

- Five editable LaTeX resume templates
- Live PDF compilation and compiler error output
- Browser-only draft auto-save (no account or database)
- Download the compiled PDF or raw `.tex` source
- Dark/light editor themes, zoom controls, and keyboard shortcuts

## Local development without Docker

The frontend can run locally, but LaTeX compilation needs `pdflatex` available on your system.

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Set `VITE_API_URL="http://localhost:3001"` in `frontend/.env` when running the Vite development server. Copy `.env.example` for the optional local environment values.

## Project structure

```text
backend/
  Dockerfile              Express API + TeX Live runtime
  src/controllers/latex.ts  Isolated LaTeX compilation endpoint
frontend/
  Dockerfile              React build stage + Nginx runtime
  nginx.conf              SPA serving and API reverse proxy
  public/templates/       Resume templates and metadata
docker-compose.yml        Two-container production stack
```

## Scope

This project intentionally has no authentication, database, or AI integration. Those features are useful in other projects , but they would distract from the Docker and containerization concepts.
