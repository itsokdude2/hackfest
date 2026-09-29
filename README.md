# HACKFEST 3.0 - Event Management & Evaluation Platform

A modern, real-time Hackathon Management Platform featuring dual-role dashboards (Admin & Participant), live leaderboard scoring across multiple evaluation rounds, track allocations, attendee check-in management, interactive arcade mini-games, and real-time announcements.

## Features

- 🛡️ **Admin Panel**:
  - Live activity feed tracking participants, check-ins, and jury evaluations.
  - Multi-round evaluations manager with rubric grading and score calibration.
  - Round progression controls (Idea Pitching, Phase 1, Phase 2, Phase 3 / Finals).
  - Finalist selection and live leaderboard with CSV exports.
  - Broadcast notifications to contestants, juries, and organizers.
  - Role-based user and permissions management.
- 👤 **Participant Dashboard**:
  - Event timeline and milestones tracker.
  - Round status, problem statement details, and rubric viewing.
  - Ready-for-jury marking and room assignment notifications.
  - Arcade mini-games zone for downtime engagement.
- ⚡ **Resilient Architecture**:
  - Auto-fallback to local sample data when unauthenticated.
  - Built-in ErrorBoundary self-healing and stream safety guards.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion, Lucide Icons, Canvas Confetti
- **Backend / Database**: Firebase Firestore, Firebase Authentication, Firebase Storage
- **2D Physics & 3D**: Matter.js, Three.js

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/itsokdude2/hackfest.git
   cd hackfest
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env.local` and add your Firebase credentials:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## License

Private / CMRTC Hackfest 2026.
