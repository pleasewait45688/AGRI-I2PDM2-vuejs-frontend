// Single source of truth for the backend API base URL.
// Defaults to local testing. To point this build at a different domain
// (e.g. a real deployment), set VITE_API_BASE_URL — either as a build arg in
// Dockerfile/docker-compose.yaml, or in a .env.local (see .env.example).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:28000/api/v1'
