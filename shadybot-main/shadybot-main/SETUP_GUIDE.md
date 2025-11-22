# 🚀 Complete Setup Guide for ShadyBot

## Step 1: Create Discord Application

### 1.1 Go to Discord Developer Portal

1. Visit https://discord.com/developers/applications
1. Click **“New Application”**
1. Name it “ShadyBot” (or whatever you prefer)
1. Click **“Create”**

### 1.2 Create Bot User

1. Go to **“Bot”** section in left sidebar
1. Click **“Add Bot”** → **“Yes, do it!”**
1. **Copy your bot token** (you’ll need this!)
- Click **“Reset Token”** if needed
- Copy and save it somewhere safe (you won’t see it again!)

### 1.3 Enable Intents

In the Bot section, scroll down to **“Privileged Gateway Intents”** and enable:

- ✅ **Presence Intent**
- ✅ **Server Members Intent**
- ✅ **Message Content Intent**

Click **“Save Changes”**

### 1.4 Configure OAuth2

1. Go to **“OAuth2”** → **“General”** in left sidebar
1. Copy your **Client ID** (save this!)
1. Copy your **Client Secret** (click “Reset Secret” if needed, save this!)
1. Add **Redirect URL**:
- For local testing: `http://localhost:10000/auth/discord/callback`
- Click **“Add Redirect”**
- Click **“Save Changes”**

-----

## Step 2: Set Up Project Files

### 2.1 Create Directory Structure

```bash
mkdir shadybot
cd shadybot
mkdir backend
mkdir -p dashboard/src
```

### 2.2 Create Backend Files

**backend/package.json**

```bash
# Copy content from "backend/package.json" artifact above
```

**backend/index.js**

```bash
# Copy content from "backend/index.js" artifact above
```

**backend/bot.js**

```bash
# Copy content from "backend/bot.js" artifact above
```

**backend/.env**

```bash
# Create this file with your actual values:
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
CLIENT_ID=YOUR_CLIENT_ID_HERE
CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
SESSION_SECRET=some_random_string_make_it_long_and_secure
CALLBACK_URL=http://localhost:10000/auth/discord/callback
DB_PATH=./shadybot.db
API_URL=http://localhost:10000
BACKEND_URL=http://localhost:10000
CORS_ORIGIN=*
PORT=10000
NODE_ENV=development
LOG_LEVEL=info
```

### 2.3 Create Dashboard Files

**dashboard/package.json**

```bash
# Copy content from "dashboard/package.json" artifact above
```

**dashboard/src/AdminDashboard.jsx**

```bash
# Copy content from "dashboard/src/AdminDashboard.jsx" artifact above
```

**dashboard/src/AdminDashboard.css**

```bash
# Copy content from "dashboard/src/AdminDashboard.css" artifact above
```

**dashboard/src/index.js**

```bash
# Copy content from "dashboard/src/index.js" artifact above
```

**dashboard/src/index.css**

```bash
# Copy content from "dashboard/src/index.css" artifact above
```

**dashboard/public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#667eea" />
    <meta name="description" content="ShadyBot Discord Moderation Dashboard" />
    <title>ShadyBot Dashboard</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

-----

## Step 3: Install Dependencies

### 3.1 Install Backend Dependencies

```bash
cd backend
npm install
```

This will install:

- better-sqlite3
- discord.js
- express
- socket.io
- passport & passport-discord
- And all other dependencies

### 3.2 Install Dashboard Dependencies

```bash
cd ../dashboard
npm install
```

This will install:

- react
- react-dom
- react-scripts
- socket.io-client

-----

## Step 4: Invite Bot to Your Server

### 4.1 Generate Invite Link

1. Go back to Discord Developer Portal
1. Go to **“OAuth2”** → **“URL Generator”**
1. Select scopes:
- ✅ **bot**
- ✅ **applications.commands**
1. Select bot permissions:
- ✅ **Manage Roles**
- ✅ **Kick Members**
- ✅ **Ban Members**
- ✅ **Timeout Members**
- ✅ **Manage Messages**
- ✅ **Read Messages/View Channels**
- ✅ **Send Messages**
- ✅ **Manage Threads**
- ✅ **Read Message History**
- ✅ **Add Reactions**
1. Copy the generated URL at the bottom
1. Paste URL in browser and select your test server
1. Click **“Authorize”**

### 4.2 Verify Bot Joined

- Check your Discord server
- You should see the bot as offline (we haven’t started it yet)

-----

## Step 5: Start the Bot (Local Testing)

### 5.1 Start Backend API Server

Open **Terminal 1**:

```bash
cd backend
node index.js
```

You should see:

```
ShadyBot web server running on port 10000
Database initialized successfully
```

### 5.2 Start Discord Bot Worker

Open **Terminal 2**:

```bash
cd backend
node bot.js
```

You should see:

```
Bot ready as ShadyBot#1234
Successfully reloaded application (/) commands
```

### 5.3 Verify Bot is Online

- Check Discord - your bot should now show as **Online** 🟢
- The bot status should say “watching your server | /help”

-----

## Step 6: Test Bot Commands

### 6.1 Initial Setup

In your Discord server, type:

```
/setup
```

This will:

- Register you as the first admin
- Initialize the bot for your server

You should see: ✅ **“Setup complete. [Your Name] added as admin.”**

### 6.2 Test Basic Commands

**Test Warnings:**

```
/warn @user This is a test warning
```

**Check Warnings:**

```
/warnings @user
```

**Test AutoMod:**

```
/automod view
```

**Enable AutoMod:**

```
/automod toggle enabled:True
```

### 6.3 Test AutoMod Filters

Send a message containing a bad word from the default list:

- Try sending: “badword1” (should be auto-deleted)
- Send multiple messages quickly (should trigger spam detection)

-----

## Step 7: Access Web Dashboard

### 7.1 Build Dashboard (One Time)

Open **Terminal 3**:

```bash
cd dashboard
npm run build
```

Wait for it to complete (creates `dashboard/build/` folder)

### 7.2 Access Dashboard

1. Open browser: http://localhost:10000
1. You’ll be redirected to Discord OAuth
1. Click **“Authorize”**
1. You’ll be redirected back to the dashboard

### 7.3 Explore Dashboard

- **Overview Tab**: See stats and recent activity
- **Logs Tab**: View all moderation actions
- **AutoMod Tab**: View AutoMod information

-----

## Step 8: Test Real-Time Features

### 8.1 Open Dashboard in Browser

Keep the dashboard open at http://localhost:10000

### 8.2 Trigger Actions in Discord

Go to Discord and:

1. Warn a user: `/warn @user test`
1. Send a filtered message
1. Spam messages to trigger timeout

### 8.3 Watch Dashboard Update

You should see logs appear **in real-time** on the dashboard without refreshing!

-----

## Troubleshooting

### Bot Won’t Start

**Error: “Missing DISCORD_TOKEN or CLIENT_ID”**

- Check your `.env` file exists in `backend/` folder
- Verify all values are filled in (no placeholder text)
- Make sure there are no quotes around values

**Error: “Failed to login”**

- Double-check your bot token is correct
- Make sure you copied the entire token
- Try resetting the token in Discord Developer Portal

### Bot Shows Offline

- Check Terminal 2 for error messages
- Verify intents are enabled in Developer Portal
- Restart the bot: Stop Terminal 2 (Ctrl+C) and run `node bot.js` again

### Commands Not Showing

- Commands take a few minutes to propagate
- Try leaving and rejoining your server
- Restart Discord client
- Check bot has proper permissions

### Dashboard Won’t Load

**“Not authenticated” error:**

- Make sure Terminal 1 (API server) is running
- Check browser console for errors (F12)
- Verify OAuth redirect URL matches in Developer Portal

**Socket connection failed:**

- Check browser console for WebSocket errors
- Verify API server is running on port 10000
- Try accessing http://localhost:10000/health

### Database Errors

**“Database is locked”**

- Only one process can write at a time
- Make sure you’re not running multiple instances
- Delete `shadybot.db` and restart (will lose data)

**“Cannot find module ‘better-sqlite3’”**

- Run `npm install` in backend folder again
- Check for any error messages during install
- May need to install build tools (Windows: windows-build-tools)

-----

## Next Steps

### Configure AutoMod

1. Use `/automod view` to see current settings
1. Modify bad words list via dashboard API
1. Adjust spam thresholds
1. Enable/disable specific filters

### Set Up Webhooks

1. Create a webhook in Discord channel settings
1. Copy webhook URL
1. Use dashboard API to configure:

```bash
# Use Postman or curl
POST http://localhost:10000/api/webhook/YOUR_GUILD_ID
{
  "webhookURL": "https://discord.com/api/webhooks/..."
}
```

### Add More Admins

```
POST http://localhost:10000/api/admins/add
{
  "userIdToAdd": "USER_DISCORD_ID"
}
```

### Monitor Logs

- Open dashboard and go to Logs tab
- Filter by type, user, or time
- Search for specific events

-----

## Ready for Production?

Once testing is complete, see the main **README.md** for:

- Deploying to Render.com
- Setting up production environment variables
- Configuring persistent storage
- Setting up monitoring and alerts

-----

## Quick Reference

### Important URLs

- Developer Portal: https://discord.com/developers/applications
- Local Dashboard: http://localhost:10000
- Health Check: http://localhost:10000/health

### Default AutoMod Settings

- Bad Words: [“badword1”, “badword2”]
- Spam Threshold: 5 messages
- Spam Window: 5 seconds
- Max Mentions: 5
- Invite Filter: Enabled
- Link Filter: Disabled
- Caps Filter: Disabled

### File Locations

- Bot Token: `backend/.env`
- Database: `backend/shadybot.db`
- Logs: Terminal output (use Winston for file logs)
- Dashboard Build: `dashboard/build/`

-----

## Need Help?

- Check terminal output for error messages
- Review logs in dashboard
- Verify all environment variables are correct
- Ensure bot has proper Discord permissions
- Check that all intents are enabled

**Common Issues:**

- Bot offline → Check bot.js terminal for errors
- Commands not working → Verify bot permissions in server
- Dashboard not loading → Check index.js terminal for errors
- Real-time not working → Check Socket.io connection in browser console
