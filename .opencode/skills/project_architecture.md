PROJECT ARCHITECTURE — CommonGround
1. Project Overview

CommonGround is a web application that helps multiple users visualize the areas where they could live to minimize commute times to work.

Key features:

Input multiple work locations and constraints (maximum driving time)

Compute individual isochrones (commute zones) using Mapbox Isochrone API

Compute the intersection of all users’ isochrones to visualize common feasible areas

Display results on an interactive map with clear visual distinctions between individual zones and overlapping areas

Designed to be a professional, shareable, portfolio-grade project

Primary goals:

Produce a clean, scalable codebase

Provide a simple, usable interface for friends or small teams

Demonstrate modern web development, geospatial computation, and UI/UX skills

Non-goals (for MVP):

Real-time traffic prediction or public transport modeling

User accounts, login, or authentication

Complex backend infrastructure (microservices, WebSockets)

2. Technical Stack
Layer	Technology	Notes
Frontend	Next.js 14+ (App Router), React, TypeScript	Modern SPA + SSR support
Styling	Tailwind CSS	Rapid, responsive UI design
Mapping	Mapbox GL JS	Interactive maps
Geocoding & Isochrones	Mapbox Geocoding & Isochrone APIs	Generate commute polygons
Geospatial Computation	Turf.js	Polygon intersection, area calculations
Backend	Next.js API Routes	Minimal backend for API calls & secret tokens
Deployment	Vercel	Simple hosting with automatic builds
Future persistence	Supabase (optional)	Store shared session data and user inputs
3. Folder Structure
/commonground
├─ /src
│  ├─ /app                 # Next.js App Router
│  │   └─ page.tsx         # Main page / entry point
│  ├─ /components          # Reusable UI components
│  │   ├─ Map.tsx           # Map rendering + polygons
│  │   ├─ UserInputForm.tsx # Address input & max commute slider
│  │   └─ ZoneLegend.tsx    # Legend for overlapping zones
│  ├─ /lib                 # Helper functions / API wrappers
│  │   ├─ mapbox.ts        # Mapbox API call logic
│  │   └─ geo.ts           # Geospatial computation (intersections)
│  └─ /types               # TypeScript interfaces & types
│      ├─ geo.ts
│      └─ user.ts
├─ /public                 # Static assets (images, icons)
├─ /styles                 # Tailwind / global CSS
├─ /docs                   # Documentation
│   └─ PROJECT_ARCHITECTURE.md
├─ package.json
├─ tsconfig.json
└─ README.md


Notes on structure:

All source code is under src/ to separate configs and docs from code

Components and libraries are modular and reusable

Types are centralized for strict TypeScript enforcement

4. Data Contracts & TypeScript Models
User Input / Commute Constraint
export interface CommuteConstraint {
  id: string;              // unique identifier
  name: string;            // user name
  address: string;         // text input address
  latitude: number;        // resolved from Mapbox geocoding
  longitude: number;
  maxMinutes: number;      // max driving time in minutes
}

Isochrone API Response

GeoJSON FeatureCollection<Polygon | MultiPolygon>

Each feature represents the driveable area

Must handle edge cases:

MultiPolygon geometries

Null or empty intersections

Invalid coordinates

5. Backend API Specification
POST /api/isochrone

Request Body:

{
  lat: number;
  lng: number;
  minutes: number;
}


Behavior:

Call Mapbox Isochrone API using MAPBOX_SECRET_TOKEN

Return GeoJSON polygon to frontend

Handle errors gracefully (400 for invalid input, 500 for server/API failure)

Backend only; secret token never exposed to frontend

6. Geospatial Computation

Use Turf.js for polygon intersection and area calculations

Iteratively intersect all user isochrones to find common areas

If intersection is empty → display “No overlapping area found”

Handle MultiPolygon results and flatten if needed for map rendering

7. Frontend State & UX

State Management: React top-level state or Context API; no Redux required

User Flow:

Enter multiple addresses

Adjust max commute sliders per user

Submit → fetch isochrones → compute intersection

Display map with:

Individual zones: light, semi-transparent

Intersection: bold color overlay

Interactive legend

Visual Feedback: Error messages for invalid input, no overlap, or failed API calls

8. Environment Variables
# Backend
MAPBOX_SECRET_TOKEN=<your-secret-token>

# Frontend
NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN=<your-public-token>


Always keep secret token on backend

Public token can be exposed to frontend for rendering maps

9. Coding Conventions

TypeScript strict mode; avoid any

Centralize reusable functions in /lib

All components in /components

API calls only in /app/api/ routes or /lib helpers

Clear error handling & validation

Tailwind + semantic HTML for accessibility

10. Testing & Quality

Optional: Jest + React Testing Library for component/unit tests

E2E testing using Cypress (future roadmap)

Linting: ESLint + Prettier

CI/CD: Vercel auto-deploy

11. Future Roadmap (Scoping)

Multi-user overlap with sharing

Encode user input into URL or session

Allow friends to load the same scenario

Persistence & Collaboration

Save scenarios to Supabase

Optional account system for multi-session support

Advanced Geospatial Features

Optional traffic/time-of-day modeling

Public transport integration

Housing/amenity overlays

UX Enhancements

Drag-and-drop address pins

Download map/zone polygons as GeoJSON or PDF

Color-blind friendly palettes

Performance & Scaling

Debounce API calls for multiple users

Caching / server-side computation of intersections

12. Professional Portfolio Notes

The project demonstrates:

Modern React + Next.js

TypeScript best practices

Geospatial computation

UX/UI design with interactive maps

Clean, scalable folder structure

Clear documentation allows AI-assisted development or collaboration

The architecture is expandable for future enhancements without breaking existing MVP