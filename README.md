# ai-automation-1
# AI Automation Exam Conducting System

An automated backend system for conducting secure online examinations, built with Node.js and PostgreSQL, with workflow automation handled through n8n and containerized deployment via Docker.

## Overview

This project automates the full lifecycle of an online exam — question management, answer submission, evaluation, and result processing — while enforcing role-based access, secure sessions, and data integrity throughout.

## Features

- **Role-based authentication & authorization** using JWT and access control mechanisms
- **REST APIs** for question management, answer submission, and result processing
- **Workflow automation** via n8n for exam scheduling and evaluation pipelines
- **Containerized deployment** using Docker for consistent, portable environments
- **Secure validation pipelines** with session control and data integrity checks across the system
- **Automated exam scheduling and result-evaluation triggers** through n8n workflows, reducing manual intervention
- **Structured PostgreSQL schemas and queries** (PL/pgSQL) for efficient question, submission, and result storage

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | PostgreSQL (PL/pgSQL) |
| Automation | n8n |
| Auth | JWT, Role-Based Access Control (RBAC) |
| Deployment | Docker |
| Frontend | TypeScript / JavaScript |

## Project Structure

```
ai-automation-1/
├── backend/     # API server, auth, exam logic, DB access
├── frontend/    # Client application
└── .vscode/     # Editor configuration
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL
- Docker & Docker Compose
- n8n (self-hosted or cloud)

### Installation

```bash
# Clone the repository
git clone https://github.com/muchumahadev2005/ai-automation-1.git
cd ai-automation-1

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Environment Variables

Create a `.env` file in the `backend/` directory with the following:

```
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

### Running with Docker

```bash
docker-compose up --build
```

### Running Locally

```bash
# Start backend
cd backend
npm run dev

# Start frontend
cd frontend
npm run dev
```

## API Overview

| Endpoint | Description |
|---|---|
| `POST /api/auth/login` | Authenticate user and issue JWT |
| `GET /api/questions` | Fetch exam questions |
| `POST /api/answers` | Submit answers for evaluation |
| `GET /api/results/:id` | Retrieve exam results |

*(Adjust the above to match your actual route names.)*

## Author

**Muchu Mahadev**
[GitHub](https://github.com/muchumahadev2005) · [LinkedIn](https://linkedin.com)

## License

This project is available for educational and demonstration purposes.
