# ResumeForge — LaTeX Resume Builder

A modern, full-stack resume builder that lets you write professional resumes in LaTeX with real-time live preview. Built to explore and understand **Docker containerization** — the backend runs a fully containerized TeX Live distribution for compiling LaTeX to PDF on the fly.

## Features

- **Live LaTeX Compilation** — Real-time side-by-side preview of your LaTeX resume, compiled inside a Docker container with TeX Live
- **Template Gallery** — Browse and pick from 5 professionally designed, ATS-friendly LaTeX templates (Deedy, Awesome-CV, ModernCV Classic, Minimalist, Two-Column)
- **Download Resume** — Download your compiled PDF or raw `.tex` source file with a single click
- **Auto-Save** — Your work auto-saves to the browser so nothing is lost on refresh
- **Dark/Light Mode** — Toggle the editor theme between dark and light
- **Zoom Controls** — Zoom in/out on the PDF preview for detailed inspection
- **Keyboard Shortcuts** — `Ctrl+S` to save & compile, `Ctrl+Enter` to force recompile
- **Error Display** — Clear, collapsible error panel showing LaTeX compiler output with copy-to-clipboard
- **Secure Authentication** — JWT-based authentication to manage your sessions

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS v4, Monaco Editor (VS Code's editor)
- **Backend**: Node.js, Express, TypeScript, Prisma (SQLite)
- **Containerization**: Docker — the backend image includes a full TeX Live distribution for LaTeX compilation. This project was built to understand how Docker works in a real-world full-stack application.

## Project Purpose

This project was built primarily as a hands-on exercise to understand **Docker** and containerization in a practical context. The backend runs inside a Docker container that bundles a complete TeX Live LaTeX distribution, demonstrating how Docker can package complex system-level dependencies alongside a Node.js application.

**Future Plans:** I'm working on adding AI capabilities (resume analysis, feedback, and job tailoring) in future iterations.

## Local Setup

### Prerequisites
- Node.js (v20+)
- Docker Desktop

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Cy-nape/resume-forge.git
   cd resume-forge
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```
   Create a `.env` file in the `backend` directory:
   ```env
   PORT=3001
   DATABASE_URL="file:./dev.db"
   JWT_SECRET="your-secret-key"
   ```
   Generate the Prisma client and push the schema:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

4. **Run with Docker** (recommended — enables LaTeX compilation)
   ```bash
   # From the project root
   docker-compose up backend
   ```
   Then in a separate terminal:
   ```bash
   cd frontend
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

### Running without Docker

You can run the backend without Docker (`cd backend && npm run dev`), but LaTeX compilation won't work since it requires `pdflatex` from TeX Live which is installed inside the Docker container. Everything else (auth, editor, templates, auto-save) will work fine.

## Templates

The project includes 5 ready-to-use LaTeX resume templates:

| Template | Style | Best For |
|----------|-------|----------|
| Deedy Resume | Clean, technical | Software engineers |
| Awesome CV | Modern, colorful | Full stack developers |
| ModernCV Classic | Academic/professional | Researchers, data scientists |
| Minimalist | Ultra-clean single-column | Product, business roles |
| Two Column Pro | Dense two-column | Experienced professionals |

Templates are stored as static `.tex` files in `frontend/public/templates/` — add more by dropping in a new `.tex` file and updating `templates.json`.

## Project Structure

```
├── backend/
│   ├── Dockerfile          # Docker image with Node.js + TeX Live
│   ├── src/
│   │   ├── index.ts        # Express server entry point
│   │   ├── controllers/    # Route handlers (auth, latex)
│   │   ├── routes/         # API route definitions
│   │   └── middleware/     # JWT authentication middleware
│   └── prisma/             # Database schema
├── frontend/
│   ├── src/
│   │   ├── pages/          # React pages (Editor, Dashboard, Templates, Login)
│   │   ├── context/        # Auth context provider
│   │   └── components/     # Reusable UI components
│   └── public/templates/   # LaTeX templates + metadata
└── docker-compose.yml      # Docker orchestration
```

## License
MIT License
