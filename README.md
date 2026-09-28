# SnapShop

SnapShop is a full-stack e-commerce platform built for selling digital products and premium catalog items through a modern React storefront and a TypeScript Express backend. The application includes authentication, checkout orchestration, product management, order tracking, live customer support chat, and admin-only catalog operations.

This project is designed as a monorepo with a Vite-powered frontend and a Node.js/Express API, connected to PostgreSQL, Clerk, Polar, Stream, ImageKit, and Sentry.

## Overview

SnapShop combines:

- A customer storefront for browsing products and placing orders
- Secure checkout and payment flow using Polar
- Clerk-based authentication and user identity management
- Admin product management with ImageKit media uploads
- Order lifecycle tracking and user-specific order views
- Stream-based live chat and video channels for support workflows
- Sentry monitoring for error tracking and debugging
- Production-friendly Docker packaging

The frontend and backend are separated by concern but intentionally shipped together in a single deployment model. The Express server serves the API and also hosts the built static frontend assets in production.

## Tech Stack

### Frontend

- React 19
- Vite
- React Router
- Zustand for client state
- TanStack React Query
- DaisyUI + Tailwind CSS
- Clerk React SDK
- Sentry React SDK
- Stream chat UI components

### Backend

- Node.js 22
- Express 5
- TypeScript
- PostgreSQL via Drizzle ORM
- Clerk backend SDK
- Polar checkout integration
- Stream Chat server integration
- ImageKit Node SDK
- Sentry Node SDK

## Architecture

The application follows a clean monorepo layout:

- Frontend: customer UI, catalog browsing, cart flow, order pages, admin console
- Backend: REST API, webhooks, auth middleware, database access, payment fulfillment, streaming support
- Database: PostgreSQL with Drizzle schema for users, products, orders, checkout sessions, and order items
- External services: Clerk for auth, Polar for billing, Stream for chat/video, ImageKit for media, Sentry for observability

### High-level flow

1. Users authenticate with Clerk.
2. The frontend loads storefront data from the API.
3. Customers add products to cart and begin checkout.
4. The backend creates a Polar checkout session and returns a redirect URL.
5. Polar webhook events update order status and complete fulfillment.
6. Admins manage products, pricing, imagery, and activation state.
7. Orders can generate chat/video channels powered by Stream.
8. Sentry captures errors and request context for production monitoring.

## Features

### Customer experience

- Product catalog with category filtering
- Product detail pages with pricing and imagery
- Cart management and checkout flow
- Order tracking and history
- Secure return flow after checkout
- Support chat / live order communication via Stream
- Video call support for order-related conversations

### Admin experience

- Restricted admin dashboard for product management
- Add, edit, and delete products
- Toggle product active state
- Upload and assign ImageKit media
- Manage catalog metadata such as name, category, slug, and pricing

### Platform infrastructure

- Health check endpoint for deployment monitoring
- Express middleware for auth and user context injection
- Webhook verification for Clerk and Polar events
- Postgres persistence with clear relational schema
- Docker-ready deployment model

## Repository Structure

```text
SnapShop/
├── backend/
│   ├── scripts/
│   ├── src/
│   ├── drizzle.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── ...
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
├── Dockerfile
├── .gitignore
├── .dockerignore
├── .coderabbit.yaml
└── README.md
```

## Prerequisites

Before running the project locally, make sure you have:

- Node.js 22+
- npm
- PostgreSQL database instance
- Clerk account and project credentials
- Polar merchant account and checkout configuration
- Stream account and API credentials
- ImageKit account and public/private credentials
- Sentry project DSN (optional but recommended)

## Environment Configuration

Create environment variables for the backend before starting the app.

Example backend environment values:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/snapshop

CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret

FRONTEND_URL=http://localhost:5173

POLAR_ACCESS_TOKEN=your_polar_access_token
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret
POLAR_API_BASE=https://api.polar.sh
POLAR_CHECKOUT_PRODUCT_ID=your_polar_product_id

STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret

IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-instance

SENTRY_DSN=https://your-sentry-dsn
```

The frontend also needs its public env values for client-side configuration.

Example frontend variables:

```env
VITE_API_BASE_URL=http://localhost:3001
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

> The backend validates environment variables using Zod. Missing or malformed values will fail startup with a clear validation error.

## Database Setup

The project uses Drizzle ORM with PostgreSQL.

### Install schema

From the backend directory:

```bash
npm install
npm run db:push
```

### Seed data

```bash
npm run db:seed
```

This creates the initial catalog and sample records needed for local development.

## Running the Project Locally

### 1. Install dependencies

Frontend:

```bash
cd frontend
npm install
```

Backend:

```bash
cd backend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

The API runs on the configured backend port, defaulting to 3001.

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The frontend runs with Vite, typically on:

- http://localhost:5173

### 4. Verify the app

Check the backend health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{ "ok": true }
```

## Available Scripts

### Backend

```bash
npm run dev
npm run build
npm run start
npm run db:push
npm run db:seed
```

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Production Build

A Dockerfile is included at the repository root for containerized deployment.

```bash
docker build -t snapshop .
```

The built image exposes port 3001 and runs the compiled Express server, which also serves the static frontend assets in the production bundle.

## API Overview

### Core routes

- `GET /health` — health check
- `GET /api/products` — list products
- `GET /api/products/categories` — list categories
- `GET /api/products/:slug` — fetch a product by slug
- `POST /api/checkout` — create a checkout session
- `POST /api/checkout/recover-by-polar-id/:checkoutId` — recover checkout data
- `GET /api/me` — current authenticated user info
- `GET /api/orders` — list user orders
- `POST /api/orders/:id/channel` — create a Stream channel for an order
- `GET /api/stream/token` — create Stream client token

### Admin routes

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/imagekit-auth` — get temporary upload auth for ImageKit

### Webhooks

- `POST /webhooks/clerk`
- `POST /webhooks/polar`

These endpoints are intentionally parsed as raw payloads for signature verification.

## Role and Access Model

The application distinguishes between user roles defined in the database schema:

- `customer`
- `support`
- `admin`

Admin-only endpoints use middleware to ensure authenticated users are authorized before modifying product data or managing protected resources.

## Observability and Monitoring

The backend and frontend integrate with Sentry for:

- Runtime error capturing
- User-scoped debug context
- Performance monitoring
- Production diagnostics

The project also includes a dedicated Sentry demo route in the frontend for validating and testing error reporting flows.

## Notes for Development

- The backend validates environment variables at startup.
- Webhook payloads must be processed as raw bodies, not JSON-parsed bodies.
- The server uses Clerk middleware for request-scoped identity management.
- Orders are fulfilled through Polar webhook handling to keep checkout completion consistent and resilient.
- Production deployment serves the frontend from the backend static directory.

## Suggested Next Improvements

This project is already functional as a commerce platform, and the following additions would make it even stronger:

- end-to-end automated tests for frontend and backend
- CI/CD pipeline setup
- better admin analytics and reporting
- inventory management and stock tracking
- email notifications for orders and checkout lifecycle updates
- stronger API documentation with Swagger or OpenAPI

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes with clear messaging
4. Open a pull request with a summary of the fix or feature

## License

This project currently follows the repository’s package configuration conventions and is intended for practical internal or educational use unless otherwise specified by the project owner.

## Summary

SnapShop is a production-oriented commerce application that brings together a modern storefront, secure checkout, user authentication, admin catalog management, and live service workflows in a single, cohesive codebase. It is structured for both local development and deployment in a containerized environment.
