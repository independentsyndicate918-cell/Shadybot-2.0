# 🛡️ ShadyBot v2.0 - Discord Moderation Bot

A powerful Discord moderation bot with an advanced web dashboard, AutoMod features, and comprehensive logging system.

## ✨ Features

### Discord Bot

- 🔨 **Moderation Commands**: Ban, kick, timeout, warn users
- 🤖 **AutoMod**: Automatic message filtering and spam detection
- 📊 **Comprehensive Logging**: Track all moderation actions
- ⚡ **Slash Commands**: Modern Discord interactions
- 🔔 **Webhook Integration**: Real-time notifications
- 🎯 **Role-Based Permissions**: Flexible access control

### Web Dashboard

- 👤 **Discord OAuth**: Secure authentication
- 📈 **Real-time Stats**: Live server statistics
- 📋 **Log Viewer**: Browse and filter moderation logs
- ⚙️ **AutoMod Config**: Configure filters and thresholds
- 🔄 **Live Updates**: Socket.io for real-time events
- 📱 **Responsive Design**: Works on all devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Discord Bot Token
- Discord OAuth Application

### Local Development

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd shadybot
```

1. **Install dependencies**

```bash
# Backend
cd backend
npm install

# Dashboard
cd ../dashboard
npm install
```

1. **Configure environment variables**

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
CALLBACK_URL=http://localhost:10000/auth/discord/callback
SESSION_SECRET=your_random_secret
```

1. **Start development servers**

```bash
# Terminal 1 - Backend API
cd backend
npm start

# Terminal 2 - Bot Worker
cd backend
npm run start:bot

# Terminal 3 - Dashboard (optional for dev)
cd dashboard
npm start
```

1. **Access the dashboard**
   Navigate to `http://localhost:10000`

## 📦 Deployment to Render

### Step 1: Prepare Your Repository

Ensure all files are committed to your Git repository.

### Step 2: Create Render Account

1. Go to [render.com](https://render.com)
1. Sign up or log in
1. Connect your GitHub/GitLab account

### Step 3: Deploy from Dashboard

#### Option A: Use Blueprint (Recommended)

1. Click “New” → “Blueprint”
1. Connect your repository
1. Render will detect `render.yaml` and configure everything automatically

#### Option B: Manual Setup

**Web Service:**

1. Click “New” → “Web Service”
1. Connect repository
1. Configure:
- **Name**: shadybot-web
- **Environment**: Node
- **Build Command**:
  
  ```bash
  cd backend && npm install && cd ../dashboard && npm install && npm run build && cd ../backend
  ```
- **Start Command**: `node backend/index.js`
- **Plan**: Starter (or Free)
1. Add Environment Variables:
   
   ```
   NODE_ENV=production
   DB_PATH=/var/data/shadybot.db
   DISCORD_TOKEN=<your_token>
   CLIENT_ID=<your_client_id>
   CLIENT_SECRET=<your_secret>
   SESSION_SECRET=<random_string>
   CALLBACK_URL=https://your-app.onrender.com/auth/discord/callback
   ```
1. Add Disk:
- Mount Path: `/var/data`
- Size: 1GB

**Worker Service:**

1. Click “New” → “Background Worker”
1. Connect repository
1. Configure:
- **Name**: shadybot-bot
- **Environment**: Node
- **Build Command**: `cd backend && npm install`
- **Start Command**: `node backend/bot.js`
1. Add Environment Variables:
   
   ```
   NODE_ENV=production
   DB_PATH=/var/data/shadybot.db
   DISCORD_TOKEN=<your_token>
   CLIENT_ID=<your_client_id>
   API_URL=https://your-app.onrender.com
   ```

### Step 4: Configure Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
1. Select your application
1. Update **OAuth2** → **Redirects**:
- Add: `https://your-app.onrender.com/auth/discord/callback`
1. **Bot** → Enable necessary intents:
- ✅ Presence Intent
- ✅ Server Members Intent
- ✅ Message Content Intent

### Step 5: Invite Bot to Server

Generate invite URL with these permissions:

- Manage Roles
- Kick Members
- Ban Members
- Timeout Members
- Manage Messages
- Send Messages
- Read Message History

Bot Permission Integer: `1099511627862`

Invite URL format:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1099511627862&scope=bot%20applications.commands
```

## 🎮 Bot Commands

### Moderation Commands

- `/warn @user [reason]` - Warn a user
- `/warnings @user` - View user warnings
- `/kick @user [reason]` - Kick a user
- `/ban @user [reason]` - Ban a user
- `/timeout @user [duration] [reason]` - Timeout a user

### Admin Commands

- `/setup` - Initialize bot (first time setup)
- `/automod view` - View AutoMod settings
- `/automod toggle [enabled]` - Enable/disable AutoMod

## 🤖 AutoMod Features

### Filters

- **Bad Words**: Custom word blacklist
- **Spam Detection**: Rate limiting based on message frequency
- **Invite Links**: Block Discord invite links
- **URL Filter**: Block all URLs (optional)
- **Caps Filter**: Detect excessive capital letters
- **Mention Spam**: Limit mass mentions

### Configuration

AutoMod settings are stored per-guild in the database:

- `enabled`: Toggle AutoMod on/off
- `badWords`: Array of filtered words
- `spamThreshold`: Messages before timeout (default: 5)
- `spamWindow`: Time window in ms (default: 5000)
- `maxMentions`: Max user/role mentions (default: 5)
- `inviteFilter`: Block Discord invites (default: true)
- `linkFilter`: Block all URLs (default: false)
- `capsFilter`: Block excessive caps (default: false)
- `capsThreshold`: Caps ratio threshold (default: 0.7)

## 🗄️ Database Schema

The bot uses SQLite with the following tables:

- **warnings**: User warnings with moderation info
- **logs**: All bot actions and events
- **admins**: Bot administrators
- **allowed_roles**: Roles with dashboard access
- **automod_settings**: Per-guild AutoMod configuration
- **webhooks**: Discord webhook URLs for notifications

## 🔒 Security Features

- ✅ Helmet.js for HTTP security headers
- ✅ Rate limiting on all API endpoints
- ✅ Input validation with express-validator
- ✅ Parameterized SQL queries (SQL injection protection)
- ✅ Session-based authentication
- ✅ CSRF protection ready
- ✅ Environment variable validation

## 📊 Monitoring & Logs

### Health Check

The web service exposes a health check endpoint:

```
GET /health
```

### Logging

Both services use Winston for structured logging:

- Console output (colored for development)
- JSON format for production
- Configurable log levels via `LOG_LEVEL` env var

### Render Dashboard

Monitor your services:

- View logs in real-time
- Check resource usage
- Monitor deployment status
- Set up alerts

## 🛠️ Troubleshooting

### Bot Not Responding

1. Check bot is online in Discord
1. Verify intents are enabled
1. Check Render worker logs
1. Ensure bot has proper permissions

### Dashboard Not Loading

1. Check web service is running
1. Verify OAuth callback URL
1. Check browser console for errors
1. Verify all env variables are set

### Database Errors

1. Verify `/var/data` disk is mounted
1. Check disk space
1. Review database permissions
1. Check for migration errors in logs

### AutoMod Not Working

1. Ensure AutoMod is enabled per-guild
1. Check bot has Manage Messages permission
1. Verify message content intent is enabled
1. Review AutoMod settings with `/automod view`

## 📝 Development

### Code Structure

```
shadybot/
├── backend/
│   ├── index.js          # Express server + API + Socket.io
│   ├── bot.js            # Discord bot worker
│   └── package.json
├── dashboard/
│   ├── src/
│   │   ├── AdminDashboard.jsx
│   │   ├── AdminDashboard.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── render.yaml           # Render deployment config
├── .env.example
└── README.md
```

### Adding New Features

#### New Bot Command

1. Add command definition to `commands` array in `bot.js`
1. Add handler in `interactionCreate` event
1. Test locally
1. Deploy

#### New API Endpoint

1. Add route in `index.js`
1. Add validation middleware
1. Add rate limiting if needed
1. Update dashboard to use endpoint

#### New AutoMod Filter

1. Add filter logic in `messageCreate` event
1. Add settings to database schema
1. Add configuration UI in dashboard

## 🤝 Contributing

1. Fork the repository
1. Create a feature branch
1. Make your changes
1. Test thoroughly
1. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🔗 Resources

- [Discord.js Documentation](https://discord.js.org/)
- [Render Documentation](https://render.com/docs)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Express.js Guide](https://expressjs.com/)

## 💬 Support

For issues and questions:

- Create an issue on GitHub
- Join our Discord server
- Check existing documentation

-----

Made with ❤️ for Discord communities
