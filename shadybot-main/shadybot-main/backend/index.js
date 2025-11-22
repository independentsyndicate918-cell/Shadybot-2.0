// backend/index.js
import express from ‘express’;
import path from ‘path’;
import { fileURLToPath } from ‘url’;
import Database from ‘better-sqlite3’;
import dotenv from ‘dotenv’;
import bodyParser from ‘body-parser’;
import session from ‘express-session’;
import passport from ‘passport’;
import { Strategy as DiscordStrategy } from ‘passport-discord’;
import http from ‘http’;
import { Server as IOServer } from ‘socket.io’;
import fetch from ‘node-fetch’;
import helmet from ‘helmet’;
import compression from ‘compression’;
import rateLimit from ‘express-rate-limit’;
import { body, query, validationResult } from ‘express-validator’;
import cors from ‘cors’;
import { createLogger, format, transports } from ‘winston’;

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger setup
const logger = createLogger({
level: process.env.LOG_LEVEL || ‘info’,
format: format.combine(
format.timestamp(),
format.errors({ stack: true }),
format.json()
),
transports: [
new transports.Console({
format: format.combine(
format.colorize(),
format.simple()
)
})
]
});

// Validate required environment variables
const requiredEnvVars = [‘DISCORD_TOKEN’, ‘CLIENT_ID’, ‘CLIENT_SECRET’, ‘SESSION_SECRET’];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
process.exit(1);
}

// Express app setup
const app = express();

// Security middleware
app.use(helmet({
contentSecurityPolicy: {
directives: {
defaultSrc: [”‘self’”],
styleSrc: [”‘self’”, “‘unsafe-inline’”],
scriptSrc: [”‘self’”],
imgSrc: [”‘self’”, “data:”, “https:”],
connectSrc: [”‘self’”, “wss:”, “ws:”]
}
}
}));

app.use(compression());
app.use(cors({
origin: process.env.CORS_ORIGIN || true,
credentials: true
}));

app.use(bodyParser.json({ limit: ‘10mb’ }));
app.use(bodyParser.urlencoded({ extended: true, limit: ‘10mb’ }));

// Session configuration
app.use(session({
secret: process.env.SESSION_SECRET,
resave: false,
saveUninitialized: false,
cookie: {
secure: process.env.NODE_ENV === ‘production’,
httpOnly: true,
maxAge: 24 * 60 * 60 * 1000 // 24 hours
}
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
clientID: process.env.CLIENT_ID,
clientSecret: process.env.CLIENT_SECRET,
callbackURL: process.env.CALLBACK_URL,
scope: [‘identify’, ‘guilds’]
}, (accessToken, refreshToken, profile, done) => {
profile.accessToken = accessToken;
return done(null, profile);
}));

// Database setup
const DB_PATH = process.env.DB_PATH || path.join(__dirname, ‘shadybot.db’);
const db = new Database(DB_PATH);
db.pragma(‘journal_mode = WAL’);

// Initialize database schema
const initDb = () => {
const schema = `
CREATE TABLE IF NOT EXISTS warnings (
id INTEGER PRIMARY KEY AUTOINCREMENT,
userId TEXT NOT NULL,
guildId TEXT NOT NULL,
moderatorId TEXT NOT NULL,
reason TEXT,
timestamp INTEGER NOT NULL,
active INTEGER DEFAULT 1
);

```
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  guildId TEXT,
  userId TEXT,
  moderatorId TEXT,
  reason TEXT,
  content TEXT,
  timestamp INTEGER NOT NULL,
  data TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT UNIQUE NOT NULL,
  addedBy TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS allowed_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT NOT NULL,
  roleId TEXT NOT NULL,
  addedBy TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  UNIQUE(guildId, roleId)
);

CREATE TABLE IF NOT EXISTS automod_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  UNIQUE(guildId, key)
);

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT UNIQUE NOT NULL,
  webhookURL TEXT NOT NULL,
  addedBy TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warnings_userId ON warnings(userId);
CREATE INDEX IF NOT EXISTS idx_warnings_guildId ON warnings(guildId);
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_guildId ON logs(guildId);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_automod_guildId ON automod_settings(guildId);
```

`;

db.exec(schema);
logger.info(‘Database initialized successfully’);
};

initDb();

// Prepared statements for better performance
const stmts = {
insertWarning: db.prepare(`INSERT INTO warnings (userId, guildId, moderatorId, reason, timestamp) VALUES (?, ?, ?, ?, ?)`),
insertLog: db.prepare(`INSERT INTO logs (type, guildId, userId, moderatorId, reason, content, timestamp, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
getWarnings: db.prepare(`SELECT * FROM warnings  WHERE userId = ? AND guildId = ? AND active = 1 ORDER BY timestamp DESC`),
isAdmin: db.prepare(`SELECT * FROM admins WHERE userId = ?`),
insertAdmin: db.prepare(`INSERT OR IGNORE INTO admins (userId, addedBy, timestamp) VALUES (?, ?, ?)`),
getAutoModSettings: db.prepare(`SELECT key, value FROM automod_settings WHERE guildId = ?`),
upsertAutoModSetting: db.prepare(`INSERT INTO automod_settings (guildId, key, value, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(guildId, key) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp`),
getWebhook: db.prepare(`SELECT webhookURL FROM webhooks WHERE guildId = ?`),
upsertWebhook: db.prepare(`INSERT INTO webhooks (guildId, webhookURL, addedBy, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(guildId) DO UPDATE SET webhookURL = excluded.webhookURL, timestamp = excluded.timestamp`)
};

// Socket.io setup
const server = http.createServer(app);
const io = new IOServer(server, {
cors: {
origin: process.env.CORS_ORIGIN || true,
credentials: true
},
pingTimeout: 60000,
pingInterval: 25000
});

// Log persistence and emission
function persistAndEmit(eventType, payload) {
try {
const result = stmts.insertLog.run(
eventType,
payload.guildId || null,
payload.user || payload.userId || null,
payload.moderator || payload.moderatorId || null,
payload.reason || null,
payload.content || null,
payload.timestamp || Date.now(),
JSON.stringify(payload.data || {})
);

```
const logEntry = { 
  id: result.lastInsertRowid,
  type: eventType, 
  ...payload 
};

io.emit('log_event', logEntry);
logger.info('Log event emitted', { type: eventType, id: result.lastInsertRowid });

return logEntry;
```

} catch (error) {
logger.error(‘Failed to persist and emit log’, { error: error.message, eventType });
throw error;
}
}

// Rate limiters
const authLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 5,
message: ‘Too many authentication attempts, please try again later’
});

const apiLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
message: ‘Too many API requests, please try again later’
});

const strictLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 20,
message: ‘Too many requests, please try again later’
});

// Middleware
function ensureAuth(req, res, next) {
if (req.isAuthenticated()) {
return next();
}
res.status(401).json({ error: ‘Not authenticated’ });
}

function validateRequest(req, res, next) {
const errors = validationResult(req);
if (!errors.isEmpty()) {
return res.status(400).json({ errors: errors.array() });
}
next();
}

async function hasAdminAccess(userId, guildId = null) {
try {
const admin = stmts.isAdmin.get(userId);
if (admin) return true;

```
if (guildId) {
  const roles = db.prepare(`
    SELECT roleId FROM allowed_roles WHERE guildId = ?
  `).all(guildId);
  
  // Additional guild-specific role checks would go here
  // This would require fetching member data from Discord API
}

return false;
```

} catch (error) {
logger.error(‘Error checking admin access’, { error: error.message, userId, guildId });
return false;
}
}

// Health check endpoint
app.get(’/health’, (req, res) => {
res.json({
status: ‘ok’,
uptime: process.uptime(),
timestamp: Date.now()
});
});

// OAuth routes
app.get(’/auth/discord’, authLimiter, passport.authenticate(‘discord’));

app.get(’/auth/discord/callback’,
authLimiter,
passport.authenticate(‘discord’, { failureRedirect: ‘/?error=auth_failed’ }),
(req, res) => {
logger.info(‘User authenticated’, { userId: req.user.id, username: req.user.username });
res.redirect(’/’);
}
);

app.get(’/auth/logout’, (req, res) => {
const userId = req.user?.id;
req.logout((err) => {
if (err) {
logger.error(‘Logout error’, { error: err.message, userId });
return res.status(500).json({ error: ‘Logout failed’ });
}
logger.info(‘User logged out’, { userId });
res.redirect(’/’);
});
});

// API routes
app.get(’/api/me’, ensureAuth, (req, res) => {
res.json({
id: req.user.id,
username: req.user.username,
discriminator: req.user.discriminator,
avatar: req.user.avatar
});
});

app.get(’/api/stats’, ensureAuth, apiLimiter, (req, res) => {
try {
const stats = {
uptime: process.uptime(),
totalWarnings: db.prepare(‘SELECT COUNT(*) as count FROM warnings WHERE active = 1’).get().count,
totalLogs: db.prepare(’SELECT COUNT(*) as count FROM logs’).get().count,
totalAdmins: db.prepare(‘SELECT COUNT(*) as count FROM admins’).get().count,
memoryUsage: process.memoryUsage()
};
res.json(stats);
} catch (error) {
logger.error(‘Failed to get stats’, { error: error.message });
res.status(500).json({ error: ‘Failed to retrieve stats’ });
}
});

app.get(’/api/warnings/:userId’,
ensureAuth,
apiLimiter,
[query(‘guildId’).optional().isString()],
validateRequest,
async (req, res) => {
try {
const { userId } = req.params;
const { guildId } = req.query;

```
  if (guildId) {
    const warnings = stmts.getWarnings.all(userId, guildId);
    res.json(warnings);
  } else {
    const warnings = db.prepare(`
      SELECT * FROM warnings 
      WHERE userId = ? AND active = 1
      ORDER BY timestamp DESC
    `).all(userId);
    res.json(warnings);
  }
} catch (error) {
  logger.error('Failed to get warnings', { error: error.message, userId: req.params.userId });
  res.status(500).json({ error: 'Failed to retrieve warnings' });
}
```

}
);

app.get(’/api/logs’,
ensureAuth,
apiLimiter,
[
query(‘type’).optional().isString(),
query(‘guildId’).optional().isString(),
query(‘userId’).optional().isString(),
query(‘limit’).optional().isInt({ min: 1, max: 500 }),
query(‘since’).optional().isInt()
],
validateRequest,
(req, res) => {
try {
const { type, guildId, userId, limit = 50, since } = req.query;

```
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const params = [];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (guildId) {
    sql += ' AND guildId = ?';
    params.push(guildId);
  }
  if (userId) {
    sql += ' AND (userId = ? OR moderatorId = ?)';
    params.push(userId, userId);
  }
  if (since) {
    sql += ' AND timestamp >= ?';
    params.push(parseInt(since));
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  const logs = db.prepare(sql).all(...params);
  res.json(logs);
} catch (error) {
  logger.error('Failed to get logs', { error: error.message });
  res.status(500).json({ error: 'Failed to retrieve logs' });
}
```

}
);

app.post(’/api/action’,
ensureAuth,
strictLimiter,
[
body(‘guildId’).isString().notEmpty(),
body(‘action’).isIn([‘kick’, ‘ban’, ‘mute’, ‘warn’, ‘unmute’, ‘unban’]),
body(‘userId’).isString().notEmpty(),
body(‘reason’).optional().isString().isLength({ max: 512 }),
body(‘duration’).optional().isInt({ min: 1, max: 2147483647 })
],
validateRequest,
async (req, res) => {
try {
const { guildId, action, userId, reason, duration } = req.body;
const hasAccess = await hasAdminAccess(req.user.id, guildId);

```
  if (!hasAccess) {
    logger.warn('Unauthorized action attempt', { 
      userId: req.user.id, 
      action, 
      targetUserId: userId 
    });
    return res.status(403).json({ error: 'Insufficient privileges' });
  }

  const payload = {
    guildId,
    action,
    userId,
    reason: reason || 'No reason provided',
    moderator: req.user.id,
    duration,
    timestamp: Date.now()
  };

  const logEntry = persistAndEmit('moderation', payload);
  
  logger.info('Moderation action logged', { 
    action, 
    userId, 
    moderator: req.user.id 
  });

  res.json({ ok: true, logId: logEntry.id });
} catch (error) {
  logger.error('Failed to execute action', { error: error.message });
  res.status(500).json({ error: 'Failed to execute action' });
}
```

}
);

app.post(’/api/admins/add’,
ensureAuth,
strictLimiter,
[body(‘userIdToAdd’).isString().notEmpty()],
validateRequest,
async (req, res) => {
try {
const { userIdToAdd } = req.body;

```
  const anyAdmin = db.prepare('SELECT * FROM admins LIMIT 1').get();
  const callerIsAdmin = await hasAdminAccess(req.user.id);

  if (anyAdmin && !callerIsAdmin) {
    return res.status(403).json({ error: 'Only existing admins can add new admins' });
  }

  const result = stmts.insertAdmin.run(
    userIdToAdd,
    req.user.id,
    Date.now()
  );

  if (result.changes > 0) {
    logger.info('Admin added', { newAdmin: userIdToAdd, addedBy: req.user.id });
    res.json({ ok: true, message: 'Admin added successfully' });
  } else {
    res.json({ ok: true, message: 'User is already an admin' });
  }
} catch (error) {
  logger.error('Failed to add admin', { error: error.message });
  res.status(500).json({ error: 'Failed to add admin' });
}
```

}
);

app.get(’/api/automod/:guildId’,
ensureAuth,
apiLimiter,
async (req, res) => {
try {
const { guildId } = req.params;
const settings = stmts.getAutoModSettings.all(guildId);

```
  const config = {};
  settings.forEach(s => {
    try {
      config[s.key] = JSON.parse(s.value);
    } catch (e) {
      config[s.key] = s.value;
    }
  });

  res.json(config);
} catch (error) {
  logger.error('Failed to get automod settings', { error: error.message });
  res.status(500).json({ error: 'Failed to retrieve automod settings' });
}
```

}
);

app.post(’/api/automod/:guildId’,
ensureAuth,
strictLimiter,
[body().isObject()],
validateRequest,
async (req, res) => {
try {
const { guildId } = req.params;
const settings = req.body;
const hasAccess = await hasAdminAccess(req.user.id, guildId);

```
  if (!hasAccess) {
    return res.status(403).json({ error: 'Insufficient privileges' });
  }

  const now = Date.now();
  const updateSettings = db.transaction((settingsObj) => {
    for (const [key, value] of Object.entries(settingsObj)) {
      stmts.upsertAutoModSetting.run(
        guildId,
        key,
        JSON.stringify(value),
        now
      );
    }
  });

  updateSettings(settings);

  logger.info('AutoMod settings updated', { guildId, updatedBy: req.user.id });
  res.json({ ok: true, message: 'AutoMod settings updated successfully' });
} catch (error) {
  logger.error('Failed to update automod settings', { error: error.message });
  res.status(500).json({ error: 'Failed to update automod settings' });
}
```

}
);

app.post(’/api/webhook/:guildId’,
ensureAuth,
strictLimiter,
[
body(‘webhookURL’)
.isURL()
.matches(/^https://(discord.com|discordapp.com)/api/webhooks//)
],
validateRequest,
async (req, res) => {
try {
const { guildId } = req.params;
const { webhookURL } = req.body;
const hasAccess = await hasAdminAccess(req.user.id, guildId);

```
  if (!hasAccess) {
    return res.status(403).json({ error: 'Insufficient privileges' });
  }

  stmts.upsertWebhook.run(guildId, webhookURL, req.user.id, Date.now());

  logger.info('Webhook configured', { guildId, configuredBy: req.user.id });
  res.json({ ok: true, message: 'Webhook configured successfully' });
} catch (error) {
  logger.error('Failed to configure webhook', { error: error.message });
  res.status(500).json({ error: 'Failed to configure webhook' });
}
```

}
);

// Internal endpoint for bot worker
app.post(’/internal/log’,
[
body(‘type’).isString().notEmpty(),
body(‘timestamp’).optional().isInt()
],
(req, res) => {
try {
const payload = req.body;
persistAndEmit(payload.type, payload);
res.json({ ok: true });
} catch (error) {
logger.error(‘Failed to log internal event’, { error: error.message });
res.status(500).json({ error: ‘Failed to log event’ });
}
}
);

// Serve React dashboard
app.use(express.static(path.join(__dirname, ‘../dashboard/build’)));
app.get(’*’, (req, res) => {
res.sendFile(path.join(__dirname, ‘../dashboard/build/index.html’));
});

// Socket.io connection handling
io.on(‘connection’, (socket) => {
logger.info(‘Dashboard client connected’, { socketId: socket.id });

try {
const recentLogs = db.prepare(`SELECT * FROM logs  ORDER BY timestamp DESC  LIMIT 100`).all();

```
socket.emit('log_history', recentLogs);
```

} catch (error) {
logger.error(‘Failed to send log history’, { error: error.message });
}

socket.on(‘disconnect’, () => {
logger.info(‘Dashboard client disconnected’, { socketId: socket.id });
});

socket.on(‘error’, (error) => {
logger.error(‘Socket error’, { error: error.message, socketId: socket.id });
});
});

// Error handling middleware
app.use((err, req, res, next) => {
logger.error(‘Unhandled error’, {
error: err.message,
stack: err.stack,
url: req.url,
method: req.method
});

res.status(err.status || 500).json({
error: process.env.NODE_ENV === ‘production’
? ‘Internal server error’
: err.message
});
});

// Graceful shutdown
process.on(‘SIGTERM’, () => {
logger.info(‘SIGTERM received, closing server gracefully’);
server.close(() => {
logger.info(‘Server closed’);
db.close();
process.exit(0);
});
});

process.on(‘SIGINT’, () => {
logger.info(‘SIGINT received, closing server gracefully’);
server.close(() => {
logger.info(‘Server closed’);
db.close();
process.exit(0);
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
logger.info(`ShadyBot web server running on port ${PORT}`);
});
