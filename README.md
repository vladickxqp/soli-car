# Soli Car

Soli Car is a full-stack fleet management system for tracking vehicles, company ownership, audit history, and contract expiration warnings.

## Features

- Email/password registration and login
- JWT authentication
- Company-level data partitioning
- Vehicle CRUD with rich fields
- Transfer vehicles between companies
- Full audit history for vehicle changes
- Dedicated `/admin` panel for user, company, vehicle, support, and log administration
- Support ticketing with threaded replies and optional attachments
- Global system logging for logins, vehicle actions, admin actions, and ticket workflows
- Company subscriptions with Stripe-ready billing flows and plan-based vehicle limits
- Advanced analytics charts for fleet growth, costs, mileage, and alerts
- Company invitations with safe workspace role assignment
- Vehicle incident attachments, fleet document storage, and maintenance records
- Vehicle location tracking with a live fleet map
- Persistent workspace preferences for theme, language, and vehicle list layout
- Self-service password change from the settings workspace
- Excel import support
- Responsive React + Tailwind UI
- Docker + docker-compose setup

## Project Structure

- `backend/` - Express API with Prisma and PostgreSQL
- `frontend/` - Vite React application with TailwindCSS
- `docker-compose.yml` - Local development stack

## Setup

No manual setup is required for Docker. The app will wait for PostgreSQL, sync the Prisma schema, seed reliable demo data, and start automatically.

1. Start the full stack:

   ```bash
   docker compose up --build -d
   ```

2. Then open in your browser:

   - Frontend UI: http://localhost:5173
   - Backend API: http://localhost:4000
   - Health endpoint: http://localhost:4000/health
   - Support workspace: http://localhost:5173/support
   - Admin panel: http://localhost:5173/admin  (`ADMIN` only)
   - Billing: http://localhost:5173/billing
   - Fleet map: http://localhost:5173/map

### Default demo users

- admin@solicar.com / Admin1234!  (`ADMIN`, platform admin, company: `Soli Car HQ`)
- companyadmin@solicar.com / CompanyAdmin1234!  (`ADMIN`, company admin only, company: `Fleet Partners`)
- user@solicar.com / User1234!  (`MANAGER`, company: `Fleet Partners`)
- viewer@solicar.com / Viewer1234!  (`VIEWER`, company: `Fleet Partners`)
- individual@solicar.com / Individual1234!  (`MANAGER`, individual workspace, company: `Individual Workspace`)

4. Access apps:

   - Backend API: http://localhost:4000
   - Frontend UI: http://localhost:5173

## Backend commands

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npx prisma db push
npm run prisma:seed
npm test
npm run dev
```

Optional Stripe environment variables for live billing:

```bash
APP_URL=http://localhost:5173
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_ENTERPRISE_PRICE_ID=
```

## Frontend commands

```bash
cd frontend
npm install
npm test
npm run dev
```

## Settings and Preferences

- Theme preference is stored in `localStorage` under `soli-car-theme` and applied globally on startup through the root `data-theme`.
- Language preference is stored under `soli-car-language` through `react-i18next`.
- Vehicle list view preference is stored under `soli-car-vehicle-view`.
- Users can change their own password from `Settings -> Password and account protection`.

## Demo Data Highlights

- `Soli Car HQ`, `Fleet Partners`, and `Individual Workspace`
- Platform admin, company admin, manager, viewer, and individual demo users
- Multiple vehicles with:
  - incident history
  - incident attachments
  - maintenance records
  - mixed document types (registration, insurance, contract, service)
- Pending and revoked company invitations
- Support tickets linked to incident-aware vehicle workflows

## Docker Behavior

- `db` has a PostgreSQL health check via `pg_isready`
- `backend` waits for a real DB connection before syncing/seeding
- `backend` exposes a DB-aware `/health` endpoint
- `frontend` starts only after the backend health check passes

You can disable automatic demo seeding by setting:

```bash
SEED_DEMO_DATA=false
```

You can skip Prisma schema sync on container start by setting:

```bash
RUN_DB_PUSH=false
```

## API Routes

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/change-password`
- `GET /admin/users`
- `POST /admin/users`
- `PUT /admin/users/:id`
- `DELETE /admin/users/:id`
- `POST /admin/users/:id/reset-password`
- `GET /admin/companies`
- `POST /admin/companies`
- `PUT /admin/companies/:id`
- `DELETE /admin/companies/:id`
- `GET /admin/tickets`
- `GET /admin/tickets/:id`
- `POST /admin/tickets/:id/messages`
- `PATCH /admin/tickets/:id`
- `GET /admin/logs`
- `GET /tickets`
- `GET /tickets/:id`
- `POST /tickets`
- `POST /tickets/:id/messages`
- `GET /billing`
- `POST /billing/subscribe`
- `POST /billing/webhook`
- `GET /analytics`
- `GET /companies`
- `GET /companies/:id/detail`
- `POST /companies/:id/invitations`
- `DELETE /companies/:id/invitations/:invitationId`
- `GET /invitations/:token`
- `GET /vehicles`
- `GET /vehicles/location`
- `POST /vehicles/location`
- `GET /vehicles/documents/:documentId/download`
- `GET /vehicles/:id`
- `POST /vehicles`
- `PUT /vehicles/:id`
- `DELETE /vehicles/:id`
- `GET /vehicles/:id/history`
- `POST /vehicles/:id/documents`
- `DELETE /vehicles/:id/documents/:documentId`
- `POST /vehicles/:id/incidents/:incidentId/attachments`
- `POST /vehicles/:id/maintenance`
- `PUT /vehicles/:id/maintenance/:recordId`
- `DELETE /vehicles/:id/maintenance/:recordId`
- `POST /vehicles/:id/transfer`

## Notes

- Registration supports both company workspaces and individual workspaces.
- Use the same `companyName` only for company registrations when you want users to join the same company.
- Admin users can transfer vehicles across companies.
- All vehicle operations are scoped to the user's company.
- Only platform admins can access `/admin`; company admins stay inside the main workspace.
- Invitation acceptance never grants platform admin access automatically.
- Demo seed includes companies, subscriptions, platform/company/individual users, vehicles, invitation records, incident records, incident attachments, maintenance history, notifications, GPS-ready locations, history records, support tickets, logs, and a transfer example.
