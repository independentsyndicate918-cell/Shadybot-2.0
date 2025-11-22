// backend/bot.js
import dotenv from ‘dotenv’;
import Database from ‘better-sqlite3’;
import path from ‘path’;
import { fileURLToPath } from ‘url’;
import {
Client,
GatewayIntentBits,
Partials,
REST,
Routes,
PermissionFlagsBits,
EmbedBuilder
} from ‘discord.js’;
import fetch from ‘node-fetch’;
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
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
logger.error(‘Missing DISCORD_TOKEN or CLIENT_ID environment variables’);
process.exit(1);
}

// Database setup
const DB_PATH = process.env.DB_PATH || path.join(__dirname, ‘shadybot.db’);
const db = new Database(DB_PATH);
db.pragma(‘journal_mode = WAL’);

// Prepared statements
const stmts = {
insertWarning: db.prepare(`INSERT INTO warnings (userId, guildId, moderatorId, reason, timestamp) VALUES (?, ?, ?, ?, ?)`),
getAutoModSettings: db.prepare(`SELECT key, value FROM automod_settings WHERE guildId = ?`),
getWebhook: db.prepare(`SELECT webhookURL FROM webhooks WHERE guildId = ?`),
getUserWarnings: db.prepare(`SELECT COUNT(*) as count FROM warnings  WHERE userId = ? AND guildId = ? AND active = 1`)
};

// Discord client setup
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildModeration
],
partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// Slash commands definition
const commands = [
{
name: ‘setup’,
description: ‘Initialize bot and set admin permissions’,
default_member_permissions: PermissionFlagsBits.Administrator.toString()
},
{
name: ‘warn’,
description: ‘Issue a warning to a user’,
default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
options: [
{
name: ‘target’,
type: 6, // USER type
description: ‘User to warn’,
required: true
},
{
name: ‘reason’,
type: 3, // STRING type
description: ‘Reason for warning’,
required: true
}
]
},
{
name: ‘warnings’,
description: ‘View warnings for a user’,
default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
options: [
{
name: ‘target’,
type: 6, // USER type
description: ‘User to check warnings for’,
required: true
}
]
},
{
name: ‘kick’,
description: ‘Kick a user from the server’,
default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
options: [
{
name: ‘target’,
type: 6,
description: ‘User to kick’,
required: true
},
{
name: ‘reason’,
type: 3,
description: ‘Reason for kick’,
required: false
}
]
},
{
name: ‘ban’,
description: ‘Ban a user from the server’,
default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
options: [
{
name: ‘target’,
type: 6,
description: ‘User to ban’,
required: true
},
{
name: ‘reason’,
type: 3,
description: ‘Reason for ban’,
required: false
},
{
name: ‘delete_days’,
type: 4, // INTEGER type
description: ‘Days of messages to delete (0-7)’,
required: false,
min_value: 0,
max_value: 7
}
]
},
{
name: ‘timeout’,
description: ‘Timeout a user’,
default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
options: [
{
name: ‘target’,
type: 6,
description: ‘User to timeout’,
required: true
},
{
name: ‘duration’,
type: 4,
description: ‘Duration in minutes (1-40320)’,
required: true,
min_value: 1,
max_value: 40320 // 28 days max
},
{
name: ‘reason’,
type: 3,
description: ‘Reason for timeout’,
required: false
}
]
},
{
name: ‘automod’,
description: ‘Configure AutoMod settings’,
default_member_permissions: PermissionFlagsBits.Administrator.toString(),
options: [
{
name: ‘view’,
type: 1, // SUB_COMMAND
description: ‘View current AutoMod settings’
},
{
name: ‘toggle’,
type: 1,
description: ‘Toggle AutoMod on/off’,
options: [
{
name: ‘enabled’,
type: 5, // BOOLEAN
description: ‘Enable or disable AutoMod’,
required: true
}
]
}
]
}
];

// Message cache for spam detection
const msgCache = new Map();
const MAX_CACHE_SIZE = 10000;

// Cleanup cache periodically
setInterval(() => {
const now = Date.now();
let deletedCount = 0;

for (const [key, value] of msgCache.entries()) {
if (now - value.last > 60000) { // Clear entries older than 1 minute
msgCache.delete(key);
deletedCount++;
}
}

// If cache is still too large, clear oldest entries
if (msgCache.size > MAX_CACHE_SIZE) {
const sortedEntries = Array.from(msgCache.entries())
.sort((a, b) => a[1].last - b[1].last);

```
const toDelete = sortedEntries.slice(0, msgCache.size - MAX_CACHE_SIZE);
toDelete.forEach(([key]) => msgCache.delete(key));
deletedCount += toDelete.length;
```

}

if (deletedCount > 0) {
logger.debug(`Cleaned ${deletedCount} entries from message cache`);
}
}, 30000);

// Helper function to send logs to web server
async function persistAndEmitViaWeb(payload) {
const apiUrl = process.env.API_URL || process.env.BACKEND_URL || ‘http://localhost:10000’;

try {
const response = await fetch(`${apiUrl}/internal/log`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify(payload)
});

```
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
```

} catch (error) {
logger.error(‘Failed to forward log to API’, {
error: error.message,
payload: payload.type
});
}
}

// Helper function to get AutoMod settings
function getAutoModSettings(guildId) {
try {
const rows = stmts.getAutoModSettings.all(guildId);
const settings = {};

```
rows.forEach(row => {
  try {
    settings[row.key] = JSON.parse(row.value);
  } catch (e) {
    settings[row.key] = row.value;
  }
});

// Default settings
return {
  enabled: settings.enabled ?? true,
  badWords: settings.badWords || ['badword1', 'badword2'],
  spamThreshold: settings.spamThreshold || 5,
  spamWindow: settings.spamWindow || 5000,
  maxMentions: settings.maxMentions || 5,
  linkFilter: settings.linkFilter ?? false,
  inviteFilter: settings.inviteFilter ?? true,
  capsFilter: settings.capsFilter ?? false,
  capsThreshold: settings.capsThreshold || 0.7
};
```

} catch (error) {
logger.error(‘Failed to get AutoMod settings’, {
error: error.message,
guildId
});
return { enabled: false };
}
}

// Helper function to send webhook
async function sendWebhook(guildId, embed) {
try {
const result = stmts.getWebhook.get(guildId);
if (!result?.webhookURL) return;

```
await fetch(result.webhookURL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ embeds: [embed] })
});
```

} catch (error) {
logger.error(‘Failed to send webhook’, {
error: error.message,
guildId
});
}
}

// Bot ready event
client.once(‘ready’, async () => {
logger.info(`Bot ready as ${client.user.tag}`);

// Register slash commands
try {
const rest = new REST({ version: ‘10’ }).setToken(process.env.DISCORD_TOKEN);

```
logger.info('Started refreshing application (/) commands');

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: commands }
);

logger.info('Successfully reloaded application (/) commands');
```

} catch (error) {
logger.error(‘Failed to register commands’, { error: error.message });
}

// Set bot status
client.user.setPresence({
activities: [{ name: ‘your server | /help’ }],
status: ‘online’
});
});

// Message create event - AutoMod
client.on(‘messageCreate’, async (msg) => {
if (msg.author.bot || !msg.guild) return;

const guildId = msg.guild.id;
const settings = getAutoModSettings(guildId);

if (!settings.enabled) return;

const content = msg.content;
const lowered = content.toLowerCase();
let violated = false;
let reason = ‘’;

// Bad words filter
if (settings.badWords && settings.badWords.length > 0) {
for (const word of settings.badWords) {
if (lowered.includes(word.toLowerCase())) {
violated = true;
reason = ‘Bad language detected’;
break;
}
}
}

// Invite filter
if (!violated && settings.inviteFilter) {
const inviteRegex = /(discord.(gg|io|me|li)|discordapp.com/invite)/.+/gi;
if (inviteRegex.test(content)) {
violated = true;
reason = ‘Discord invite link detected’;
}
}

// Link filter
if (!violated && settings.linkFilter) {
const urlRegex = /(https?://[^\s]+)/gi;
if (urlRegex.test(content)) {
violated = true;
reason = ‘Link detected’;
}
}

// Caps filter
if (!violated && settings.capsFilter && content.length > 10) {
const capsCount = (content.match(/[A-Z]/g) || []).length;
const capsRatio = capsCount / content.length;
if (capsRatio > settings.capsThreshold) {
violated = true;
reason = ‘Excessive caps detected’;
}
}

// Mention spam filter
if (!violated && settings.maxMentions) {
const mentionCount = (msg.mentions.users.size + msg.mentions.roles.size);
if (mentionCount > settings.maxMentions) {
violated = true;
reason = ‘Mention spam detected’;
}
}

// If violated, delete message and warn
if (violated) {
try {
await msg.delete();

```
  stmts.insertWarning.run(
    msg.author.id,
    guildId,
    'AUTO',
    `AutoMod: ${reason}`,
    Date.now()
  );
  
  const warningCount = stmts.getUserWarnings.get(msg.author.id, guildId).count;
  
  const embed = {
    color: 0xff9900,
    title: '⚠️ AutoMod Action',
    fields: [
      { name: 'User', value: `<@${msg.author.id}>`, inline: true },
      { name: 'Reason', value: reason, inline: true },
      { name: 'Warnings', value: warningCount.toString(), inline: true },
      { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true }
    ],
    timestamp: new Date().toISOString()
  };
  
  await sendWebhook(guildId, embed);
  
  await persistAndEmitViaWeb({
    type: 'automod_action',
    guildId,
    userId: msg.author.id,
    reason,
    content: content.substring(0, 100),
    timestamp: Date.now()
  });
  
  // Send DM to user
  try {
    await msg.author.send({
      embeds: [{
        color: 0xff9900,
        title: '⚠️ AutoMod Warning',
        description: `Your message in **${msg.guild.name}** was removed.\n**Reason:** ${reason}\n**Warnings:** ${warningCount}`,
        timestamp: new Date().toISOString()
      }]
    });
  } catch (e) {
    logger.debug('Could not DM user', { userId: msg.author.id });
  }
  
} catch (error) {
  logger.error('AutoMod action failed', { 
    error: error.message,
    userId: msg.author.id 
  });
}
return;
```

}

// Spam detection
const now = Date.now();
const cacheKey = `${guildId}-${msg.author.id}`;
const userData = msgCache.get(cacheKey) || { last: 0, count: 0, messages: [] };

// Clean old messages
userData.messages = userData.messages.filter(ts => now - ts < settings.spamWindow);
userData.messages.push(now);

if (userData.messages.length >= settings.spamThreshold) {
try {
const timeoutDuration = 5 * 60 * 1000; // 5 minutes
await msg.member.timeout(timeoutDuration, ‘AutoMod: Spam detected’);

```
  stmts.insertWarning.run(
    msg.author.id,
    guildId,
    'AUTO',
    'AutoMod: Spam',
    Date.now()
  );
  
  const embed = {
    color: 0xff0000,
    title: '🔇 AutoMod Timeout',
    fields: [
      { name: 'User', value: `<@${msg.author.id}>`, inline: true },
      { name: 'Reason', value: 'Spam detected', inline: true },
      { name: 'Duration', value: '5 minutes', inline: true }
    ],
    timestamp: new Date().toISOString()
  };
  
  await sendWebhook(guildId, embed);
  
  await persistAndEmitViaWeb({
    type: 'automod_timeout',
    guildId,
    userId: msg.author.id,
    reason: 'Spam',
    count: userData.messages.length,
    timestamp: Date.now()
  });
  
  msgCache.delete(cacheKey);
} catch (error) {
  logger.error('Spam timeout failed', { 
    error: error.message,
    userId: msg.author.id 
  });
}
```

} else {
userData.last = now;
userData.count = userData.messages.length;
msgCache.set(cacheKey, userData);
}
});

// Slash command handling
client.on(‘interactionCreate’, async (interaction) => {
if (!interaction.isChatInputCommand()) return;

const { commandName, guild, user, member } = interaction;

try {
switch (commandName) {
case ‘setup’: {
stmts.insertWarning.run = db.prepare(`INSERT OR IGNORE INTO admins (userId, addedBy, timestamp) VALUES (?, ?, ?)`).run(user.id, user.id, Date.now());

```
    await interaction.reply({
      embeds: [{
        color: 0x00ff00,
        title: '✅ Setup Complete',
        description: `${user.tag} has been added as an admin.`,
        timestamp: new Date().toISOString()
      }],
      ephemeral: true
    });
    
    logger.info('Setup completed', { userId: user.id, guildId: guild.id });
    break;
  }
  
  case 'warn': {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need Moderate Members permission to use this command.',
        ephemeral: true
      });
    }
    
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    
    stmts.insertWarning.run(
      target.id,
      guild.id,
      user.id,
      reason,
      Date.now()
    );
    
    const warningCount = stmts.getUserWarnings.get(target.id, guild.id).count;
    
    const embed = {
      color: 0xff9900,
      title: '⚠️ User Warned',
      fields: [
        { name: 'User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${user.id}>`, inline: true },
        { name: 'Total Warnings', value: warningCount.toString(), inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [embed] });
    await sendWebhook(guild.id, embed);
    
    await persistAndEmitViaWeb({
      type: 'warning',
      guildId: guild.id,
      userId: target.id,
      moderatorId: user.id,
      reason,
      timestamp: Date.now()
    });
    
    // DM user
    try {
      await target.send({
        embeds: [{
          color: 0xff9900,
          title: '⚠️ Warning Received',
          description: `You received a warning in **${guild.name}**`,
          fields: [
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: warningCount.toString() }
          ],
          timestamp: new Date().toISOString()
        }]
      });
    } catch (e) {
      logger.debug('Could not DM warned user', { userId: target.id });
    }
    
    break;
  }
  
  case 'warnings': {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need Moderate Members permission to use this command.',
        ephemeral: true
      });
    }
    
    const target = interaction.options.getUser('target');
    const warnings = db.prepare(`
      SELECT * FROM warnings 
      WHERE userId = ? AND guildId = ? AND active = 1
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(target.id, guild.id);
    
    if (warnings.length === 0) {
      return interaction.reply({
        content: `✅ ${target.tag} has no warnings.`,
        ephemeral: true
      });
    }
    
    const warningList = warnings.map((w, i) => {
      const date = new Date(w.timestamp).toLocaleDateString();
      return `**${i + 1}.** ${w.reason} - *${date}*`;
    }).join('\n');
    
    await interaction.reply({
      embeds: [{
        color: 0xff9900,
        title: `⚠️ Warnings for ${target.tag}`,
        description: warningList,
        footer: { text: `Total: ${warnings.length} warning(s)` }
      }],
      ephemeral: true
    });
    break;
  }
  
  case 'kick': {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        content: '❌ You need Kick Members permission to use this command.',
        ephemeral: true
      });
    }
    
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!target.kickable) {
      return interaction.reply({
        content: '❌ I cannot kick this user.',
        ephemeral: true
      });
    }
    
    await target.kick(reason);
    
    const embed = {
      color: 0xff6600,
      title: '👢 User Kicked',
      fields: [
        { name: 'User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${user.id}>`, inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [embed] });
    await sendWebhook(guild.id, embed);
    
    await persistAndEmitViaWeb({
      type: 'kick',
      guildId: guild.id,
      userId: target.id,
      moderatorId: user.id,
      reason,
      timestamp: Date.now()
    });
    
    break;
  }
  
  case 'ban': {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        content: '❌ You need Ban Members permission to use this command.',
        ephemeral: true
      });
    }
    
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;
    
    if (!target.bannable) {
      return interaction.reply({
        content: '❌ I cannot ban this user.',
        ephemeral: true
      });
    }
    
    await target.ban({ 
      reason, 
      deleteMessageSeconds: deleteDays * 24 * 60 * 60 
    });
    
    const embed = {
      color: 0xff0000,
      title: '🔨 User Banned',
      fields: [
        { name: 'User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${user.id}>`, inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [embed] });
    await sendWebhook(guild.id, embed);
    
    await persistAndEmitViaWeb({
      type: 'ban',
      guildId: guild.id,
      userId: target.id,
      moderatorId: user.id,
      reason,
      timestamp: Date.now()
    });
    
    break;
  }
  
  case 'timeout': {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need Moderate Members permission to use this command.',
        ephemeral: true
      });
    }
    
    const target = interaction.options.getMember('target');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    if (!target.moderatable) {
      return interaction.reply({
        content: '❌ I cannot timeout this user.',
        ephemeral: true
      });
    }
    
    await target.timeout(duration * 60 * 1000, reason);
    
    const embed = {
      color: 0xff9900,
      title: '🔇 User Timed Out',
      fields: [
        { name: 'User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${user.id}>`, inline: true },
        { name: 'Duration', value: `${duration} minutes`, inline: true },
        { name: 'Reason', value: reason }
      ],
      timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [embed] });
    await sendWebhook(guild.id, embed);
    
    await persistAndEmitViaWeb({
      type: 'timeout',
      guildId: guild.id,
      userId: target.id,
      moderatorId: user.id,
      reason,
      duration,
      timestamp: Date.now()
    });
    
    break;
  }
  
  case 'automod': {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need Administrator permission to use this command.',
        ephemeral: true
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'view') {
      const settings = getAutoModSettings(guild.id);
      
      await interaction.reply({
        embeds: [{
          color: 0x0099ff,
          title: '⚙️ AutoMod Settings',
          fields: [
            { name: 'Enabled', value: settings.enabled ? '✅ Yes' : '❌ No', inline: true },
            { name: 'Spam Threshold', value: settings.spamThreshold.toString(), inline: true },
            { name: 'Max Mentions', value: settings.maxMentions.toString(), inline: true },
            { name: 'Invite Filter', value: settings.inviteFilter ? '✅ On' : '❌ Off', inline: true },
            { name: 'Link Filter', value: settings.linkFilter ? '✅ On' : '❌ Off', inline: true },
            { name: 'Caps Filter', value: settings.capsFilter ? '✅ On' : '❌ Off', inline: true }
          ]
        }],
        ephemeral: true
      });
    } else if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      
      db.prepare(`
        INSERT INTO automod_settings (guildId, key, value, timestamp)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guildId, key) DO UPDATE SET value = excluded.value, timestamp = excluded.timestamp
      `).run(guild.id, 'enabled', JSON.stringify(enabled), Date.now());
      
      await interaction.reply({
        embeds: [{
          color: enabled ? 0x00ff00 : 0xff0000,
          title: enabled ? '✅ AutoMod Enabled' : '❌ AutoMod Disabled',
          description: enabled 
            ? 'AutoMod is now active and will monitor messages.' 
            : 'AutoMod has been disabled.',
          timestamp: new Date().toISOString()
        }],
        ephemeral: true
      });
    }
    
    break;
  }
}
```

} catch (error) {
logger.error(‘Command execution failed’, {
error: error.message,
command: commandName,
userId: user.id,
guildId: guild?.id
});

```
const errorMessage = {
  content: '❌ An error occurred while executing this command.',
  ephemeral: true
};

if (interaction.replied || interaction.deferred) {
  await interaction.followUp(errorMessage);
} else {
  await interaction.reply(errorMessage);
}
```

}
});

// Error handling
client.on(‘error’, (error) => {
logger.error(‘Discord client error’, { error: error.message });
});

process.on(‘unhandledRejection’, (error) => {
logger.error(‘Unhandled promise rejection’, { error: error.message });
});

// Graceful shutdown
process.on(‘SIGTERM’, () => {
logger.info(‘SIGTERM received, closing bot gracefully’);
client.destroy();
db.close();
process.exit(0);
});

process.on(‘SIGINT’, () => {
logger.info(‘SIGINT received, closing bot gracefully’);
client.destroy();
db.close();
process.exit(0);
});

// Login
client.login(process.env.DISCORD_TOKEN).catch((error) => {
logger.error(‘Failed to login’, { error: error.message });
process.exit(1);
});
