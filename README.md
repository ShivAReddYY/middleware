# Fluenosity Middleware

A robust, modular communication and state synchronization middleware connecting the Fluenosity Web Dashboard, Discord Bot cluster, and MongoDB storage.

## Architecture Overview

```
middleware/
├── auth/                 # Discord OAuth2 authentication & session identity routes
│   ├── discordStrategy.js
│   └── routes.js
├── core/                 # Express, HTTP, Socket.IO, and Session bootstrap
│   ├── bootstrap.js
│   ├── debugLogger.js
│   ├── runtimeEvents.js
│   └── sockets.js
├── guild/                # Guild access control, permissions, and validation
│   └── routes.js
├── lib/                  # Shared communication infrastructure & protocol
│   ├── authMiddleware.js
│   ├── botHealth.js
│   ├── botRegistry.js
│   ├── configProtocol.js
│   ├── createModuleRoutes.js
│   ├── dispatchConfig.js
│   ├── moduleState.js
│   ├── mountModules.js
│   └── requestLog.js
├── modules/              # Auto-discovered feature module routes (~38 modules)
│   ├── welcome/
│   ├── leveling/
│   ├── tickets/
│   ├── reactionroles/
│   └── ...
├── index.js              # Application entry point
├── package.json
└── .env.example
```

## Features

- **Bi-directional Protocol**: Socket.IO-based request/response lifecycle protocol with automatic retries, acknowledgment, concurrency control, and timeout management.
- **Bot Registry & Health Tracking**: Real-time tracking of active Discord bot instances, connected servers, and heartbeat monitoring.
- **Modular Dynamic Routing**: 35+ feature modules automatically discovered and mounted on boot via standard DRY endpoints.
- **Discord OAuth2**: Secure session authentication via Passport Discord Strategy with server permission validation.
- **Real-Time Event Relay**: Immediate propagation of state changes and live progress events between the web dashboard and Discord bots.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- MongoDB instance (MongoDB Atlas or local)
- Discord Developer Application (Client ID & Secret)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ShivAReddYY/middleware.git
   cd middleware
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   ```env
   PORT=10000
   FRONTEND_URL=http://localhost:3000
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   DISCORD_CALLBACK_URL=http://localhost:10000/auth/discord/callback
   API_KEYS_MONGODB_URI=mongodb+srv://...
   REQUIRED_GUILD_ID=your_guild_id
   ```

### Running the Server

- Production:
  ```bash
  npm start
  ```

- Development:
  ```bash
  npm run dev
  ```

## Observability & Debugging

- `GET /api/debug`: Returns runtime system telemetry and connection status in JSON.
- `GET /debug`: Serves the debug snapshot viewer.
- `GET /api/admin/protocol-stats`: Admin endpoint showing recent request logs, bot health metrics, and protocol stats.

## License

ISC
