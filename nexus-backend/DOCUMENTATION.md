# Nexus Full-Stack Integration — Project Documentation

## Project Overview

**Business Nexus** connects Entrepreneurs with Investors via a full-stack platform featuring authenticated dashboards, real-time video calling, document management, and payment processing.

| Layer | Technology | Host |
|---|---|---|
| Frontend | React (existing) | Vercel |
| Backend | Node.js + Express | Render / Heroku |
| Database | MongoDB Atlas | Cloud |
| Storage | AWS S3 | Cloud |
| Payments | Stripe Sandbox | Cloud |
| Real-time | Socket.IO + WebRTC | Backend |

---

## Week 1 — Setup & Core Backend Foundations

### Milestone 1: Environment Setup & Codebase Familiarization

**Completed work:**
- Forked and cloned Nexus repository; catalogued all existing frontend routes and UI components
- Initialized Node.js + Express backend with production-grade project structure
- Configured MongoDB connection via Mongoose with retry logic and environment-based URI
- Set up CORS, Helmet, Morgan, and global rate limiting
- Created `render.yaml` for one-click Render deployment
- Created `.env.example` listing all required environment variables

**Backend folder structure:**
```
nexus-backend/
├── server.js               # Entry point, HTTP + Socket.IO server
├── config/
│   ├── db.js               # MongoDB connection
│   └── swagger.js          # API documentation setup
├── middleware/
│   ├── auth.js             # JWT protect + RBAC authorize
│   ├── errorHandler.js     # Global error handler
│   ├── validate.js         # express-validator rules
│   └── upload.js           # Multer + S3 middleware
├── models/                 # Mongoose schemas
├── routes/                 # Express routers
├── controllers/            # Business logic
├── services/               # Email, notifications
├── utils/                  # Helpers (tokens, response)
└── sockets/                # Socket.IO handlers
```

**Frontend APIs documented that need backend:**
- `/login`, `/register` → `POST /api/auth/login`, `POST /api/auth/register`
- Dashboard data → `GET /api/users/dashboard-stats`
- Meeting calendar → `/api/meetings`
- Document chamber → `/api/documents`
- Payment section → `/api/payments`
- Video call rooms → `/api/video`, Socket.IO

---

### Milestone 2: User Authentication & Profiles

**Completed work:**

**Authentication system:**
- JWT access tokens (7-day expiry) + refresh tokens (30-day) with rotation
- bcrypt password hashing with salt rounds of 12
- Role-based access control: `investor`, `entrepreneur`, `admin`
- Email verification flow via Nodemailer
- Password reset via secure tokenized email link
- 2FA via TOTP (speakeasy/Google Authenticator) + email OTP fallback
- Token refresh interceptor in frontend `api.js`

**User profiles stored in MongoDB:**
- Common: `firstName`, `lastName`, `email`, `bio`, `avatar`, `phone`, `location`, `website`, `linkedIn`
- Entrepreneur-specific: `startupName`, `startupStage`, `industry`, `fundingNeeded`, `pitchDeck`
- Investor-specific: `investmentRange`, `portfolioSize`, `preferredStages`, `preferredIndustries`

**API endpoints delivered:**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT pair |
| POST | `/api/auth/verify-2fa` | Verify OTP / TOTP |
| GET | `/api/auth/verify-email/:token` | Confirm email address |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password/:token` | Set new password |
| POST | `/api/auth/refresh-token` | Rotate token pair |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/setup-2fa` | Generate TOTP QR code |
| POST | `/api/auth/confirm-2fa` | Enable 2FA |
| POST | `/api/auth/disable-2fa` | Disable 2FA |
| GET | `/api/users` | List users (filterable) |
| GET | `/api/users/:id` | Get public profile |
| PUT | `/api/users/profile` | Update own profile |
| POST | `/api/users/avatar` | Upload avatar to S3 |
| PUT | `/api/users/change-password` | Change password |
| GET | `/api/users/dashboard-stats` | Dashboard counts + recent transactions |

---

## Week 2 — Collaboration & Document Handling

### Milestone 3: Meeting Scheduling System

**Completed work:**
- Full meeting CRUD with organizer/attendee model
- **Conflict detection:** prevents double-booking by checking overlapping time windows for both parties via MongoDB query before creating any meeting
- Scheduling, accepting, rejecting, and cancelling meetings with reason tracking
- Available time-slot generation (30-min slots, 09:00–17:00)
- Email notifications sent on request, acceptance, and rejection
- In-app notifications created for all meeting state changes
- Meeting room IDs generated (UUID v4) and linked to video call URLs

**Conflict detection logic:**
```js
// Checks for any meeting where:
// this meeting's startTime < existing endTime AND this meeting's endTime > existing startTime
const hasConflict = async (userId, startTime, endTime) => {
  return Meeting.exists({
    $or: [{ organizer: userId }, { attendees: userId }],
    status: { $in: ['pending', 'accepted'] },
    startTime: { $lt: endTime },
    endTime:   { $gt: startTime },
  });
};
```

**API endpoints delivered:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/meetings` | My meetings (paginated, filterable) |
| POST | `/api/meetings` | Create meeting request |
| GET | `/api/meetings/upcoming` | Next 5 confirmed meetings |
| GET | `/api/meetings/available-slots` | Available 30-min slots for a user on a date |
| GET | `/api/meetings/:id` | Get single meeting |
| PUT | `/api/meetings/:id` | Update meeting details |
| POST | `/api/meetings/:id/respond` | Accept / reject / cancel |

---

### Milestone 4: Video Calling Integration

**Completed work:**
- **WebRTC signaling server** implemented via Socket.IO
- Mesh topology: every participant connects P2P with every other participant
- ICE candidate exchange, SDP offer/answer flow
- Media controls: mute audio, disable video, screen share with track replacement
- In-memory room management (upgrade to Redis in production for multi-instance)
- JWT-authenticated Socket.IO connections
- `useVideoCall` React hook with full peer connection lifecycle management
- `VideoCall.jsx` component with participant grid, control bar, screen share

**Socket.IO events:**

| Event (client → server) | Purpose |
|---|---|
| `join-room` | Enter a video room |
| `offer` | WebRTC SDP offer to a peer |
| `answer` | WebRTC SDP answer |
| `ice-candidate` | ICE candidate exchange |
| `media-toggle` | Broadcast audio/video state |
| `screen-share-start/stop` | Broadcast screen share state |
| `leave-room` | Exit and clean up |

| Event (server → client) | Purpose |
|---|---|
| `room-participants` | Existing participant socket IDs |
| `user-joined` | New participant entered |
| `user-left` | Participant disconnected |
| `offer/answer/ice-candidate` | Relayed WebRTC signaling |
| `participant-media-toggle` | Remote media state change |
| `notification` | Real-time in-app notification |

---

### Milestone 5: Document Processing Chamber

**Completed work:**
- File upload to AWS S3 via Multer-S3 (documents up to 50 MB, images up to 5 MB)
- Supported formats: PDF, Word, Excel, PowerPoint, JPEG, PNG, WebP
- Document metadata stored in MongoDB: name, category, version, status, tags
- Document sharing with named users; view tracking (who viewed, when)
- Document workflow statuses: `draft` → `under-review` → `approved` / `rejected` / `signed`
- **E-signature:** signature image uploaded to S3, linked to document with signer identity, timestamp, and IP address
- **Versioning:** upload new version linked to parent document
- Old avatar/document files cleaned up from S3 on replacement/deletion

**API endpoints delivered:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/documents` | My documents (paginated) |
| POST | `/api/documents` | Upload new document |
| GET | `/api/documents/:id` | Get document + view tracking |
| POST | `/api/documents/:id/share` | Share with user IDs |
| PATCH | `/api/documents/:id/status` | Update workflow status |
| POST | `/api/documents/:id/sign` | Upload signature image |
| POST | `/api/documents/:id/version` | Upload new version |
| DELETE | `/api/documents/:id` | Delete + remove from S3 |

---

## Week 3 — Payments, Security & Deployment

### Milestone 6: Payment Section (Stripe Sandbox)

**Completed work:**
- Stripe PaymentIntents for deposits (client-side card collection via `@stripe/react-stripe-js`)
- Stripe webhook handler validates signatures and updates transaction status
- Transfer between users (mock instant settlement)
- Withdrawal flow (mock async processing with status update)
- Wallet balance aggregation via MongoDB `$aggregate`
- Transaction history paginated by type, status, date
- Email confirmations for completed payments
- In-app notifications for sends and receives

**Transaction states:** `pending` → `processing` → `completed` / `failed` / `refunded`

**API endpoints delivered:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payments` | Transaction history |
| GET | `/api/payments/wallet` | Balance + totals |
| POST | `/api/payments/deposit` | Create Stripe PaymentIntent |
| POST | `/api/payments/withdraw` | Initiate withdrawal |
| POST | `/api/payments/transfer` | Transfer to another user |
| POST | `/api/payments/webhook` | Stripe webhook receiver |

---

### Milestone 7: Security Enhancements

**Completed work:**

| Security Measure | Implementation |
|---|---|
| Password hashing | bcrypt, 12 salt rounds |
| JWT access tokens | 7-day expiry, HS256 |
| JWT refresh rotation | Single-use, stored list per user |
| Input validation | express-validator on all POST/PUT endpoints |
| XSS prevention | Helmet CSP headers |
| Rate limiting | 200 req/15min global; 10 req/15min for auth |
| CORS | Origin whitelist via env var |
| SQL/NoSQL injection | Mongoose parameterized queries; no raw string interpolation |
| 2FA (TOTP) | speakeasy library, Google Authenticator compatible |
| 2FA (Email OTP) | SHA-256 hashed OTP, 10-min expiry |
| Role-based access | `authorize()` middleware on all sensitive routes |
| Email enumeration | Forgot password always returns 200 |
| Refresh token invalidation | All sessions wiped on password reset |
| File type validation | Whitelist MIME types in Multer |
| Stripe webhook | Signature verification via `stripe.webhooks.constructEvent` |
| S3 uploads | Private bucket; pre-signed URLs for access |

---

### Milestone 8: Final Integration & Deployment

**Deployment configuration:**

**Backend → Render:**
1. Connect GitHub repo to Render
2. Set Build Command: `npm install`
3. Set Start Command: `node server.js`
4. Add all environment variables from `.env.example`
5. `render.yaml` included for infrastructure-as-code deployment

**Frontend → Vercel:**
1. Add to existing Nexus Vercel project:
```bash
REACT_APP_API_URL=https://nexus-backend.onrender.com/api
REACT_APP_SOCKET_URL=https://nexus-backend.onrender.com
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
2. Place `frontend-integration/api.js` → `src/services/api.js`
3. Place `frontend-integration/useSocket.js` → `src/hooks/useSocket.js`
4. Place `frontend-integration/AuthContext.js` → `src/context/AuthContext.js`
5. Place `frontend-integration/StripePayment.jsx` → `src/components/payments/StripePayment.jsx`
6. Place `frontend-integration/VideoCall.jsx` → `src/components/video/VideoCall.jsx`

**API Documentation:**
- Swagger UI available at: `https://nexus-backend.onrender.com/api-docs`
- OpenAPI 3.0 JSON at: `https://nexus-backend.onrender.com/api-docs.json`
- Import JSON into Postman for full collection

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Access token signing secret (32+ chars) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing secret |
| `AWS_ACCESS_KEY_ID` | ✅ | AWS IAM key for S3 |
| `AWS_SECRET_ACCESS_KEY` | ✅ | AWS IAM secret |
| `AWS_S3_BUCKET` | ✅ | S3 bucket name |
| `STRIPE_SECRET_KEY` | ✅ | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret |
| `SMTP_HOST/USER/PASS` | ✅ | SMTP credentials for Nodemailer |
| `CLIENT_URL` | ✅ | Frontend URL (Vercel deployment) |

---

## Testing with Postman

**Quick start:**
1. Import `nexus-backend.postman_collection.json` (generate from `/api-docs.json`)
2. Set collection variable `base_url` = `http://localhost:5000/api`
3. Register → Login → copy `accessToken` → set as Bearer token
4. All protected endpoints use the token automatically

**Test card numbers (Stripe sandbox):**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`
- Expiry: any future date | CVV: any 3 digits
