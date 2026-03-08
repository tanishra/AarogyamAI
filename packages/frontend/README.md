# Admin Panel Frontend - MVP

This is the frontend application for the AI-Assisted Clinical Reasoning System Admin Panel.

## Features Implemented (MVP)

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (Administrator, DPO)
- Session management with expiration warnings
- Automatic token refresh

### User Management (Administrator)
- Registration request queue (approve/reject)
- User list with search and pagination
- User detail view with activity history
- Role management with self-action prevention
- Account activation/deactivation
- Password reset
- MFA management (enable/disable/re-enroll)

### Dashboard
- Welcome page with role-based quick actions
- Links to main features
- MVP status indicator

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context + TanStack Query
- **HTTP Client**: Axios with interceptors
- **Testing**: Vitest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running (see `packages/backend/README.md`)

### Installation

```bash
cd packages/frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/             # Admin-only pages
│   │   └── users/         # User management page
│   ├── dashboard/         # Dashboard page
│   ├── login/             # Login page
│   └── layout.tsx         # Root layout with providers
├── components/            # Reusable components
│   ├── admin/            # Admin-specific components
│   ├── ErrorBoundary.tsx
│   ├── LoadingSpinner.tsx
│   ├── Navigation.tsx
│   └── SessionManager.tsx
├── lib/                   # Core libraries
│   ├── api/              # API client and services
│   ├── auth/             # Authentication context and guards
│   ├── errors/           # Error handling utilities
│   └── notifications/    # Toast notification system
└── test/                 # Test utilities
```

## User Flow

1. **Login** (`/login`)
   - Enter email and password
   - Redirects to dashboard on success

2. **Dashboard** (`/dashboard`)
   - Shows welcome message and role
   - Quick action cards based on role
   - Links to main features

3. **User Management** (`/admin/users`)
   - **Registration Queue Tab**: Approve/reject pending requests
   - **All Users Tab**: View, search, and manage users
   - Click user to view details and perform actions

## API Integration

The frontend communicates with the backend API at `/api/*` endpoints:

- **Auth**: `/api/admin/auth/*` (login, logout, refresh)
- **User Management**: `/api/admin/*` (users, registration requests)
- **Metrics**: `/api/metrics/*` (dashboard metrics)
- **Audit**: `/api/audit/*` (audit logs)
- **Consent**: `/api/consent/*`, `/api/grievances`, `/api/data-access-requests`

## Authentication Flow

1. User logs in with credentials
2. Backend returns access token (8h) and refresh token (30d)
3. Access token stored in memory (not localStorage)
4. Axios interceptor adds token to all requests
5. On 401 error, automatically refreshes token
6. Session manager warns 5 minutes before expiration

## Role-Based Access

- **Administrator**: User management, metrics (coming soon), audit logs (coming soon)
- **DPO**: Consent management (coming soon), grievances (coming soon), audit logs (coming soon), compliance reports (coming soon)

## Coming Soon

- Metrics dashboard with visualizations
- Audit log viewer with filtering
- Consent and grievance management
- Compliance report generation

## Testing

The project includes comprehensive unit tests for:

- Authentication components (21 tests)
- API client and error handling (40 tests)
- User management components (18 tests)
- Dashboard page (7 tests)

Run `npm test` to execute all tests.

## Troubleshooting

### "Network Error" on API calls

- Ensure backend is running on port 3001
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify CORS is configured in backend

### Session expires immediately

- Check system clock is synchronized
- Verify JWT token expiration in backend
- Clear browser cache and cookies

### Tests failing

- Run `npm install` to ensure dependencies are up to date
- Check Node.js version (18+ required)
- Clear test cache: `npm test -- --clearCache`

## License

Proprietary - All rights reserved
