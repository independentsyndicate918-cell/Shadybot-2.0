import React, { useState, useEffect } from ‘react’;
import { io } from ‘socket.io-client’;
import ‘./AdminDashboard.css’;

const AdminDashboard = () => {
const [user, setUser] = useState(null);
const [stats, setStats] = useState(null);
const [logs, setLogs] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const [activeTab, setActiveTab] = useState(‘overview’);
const [socket, setSocket] = useState(null);

useEffect(() => {
// Fetch user info
fetch(’/api/me’, { credentials: ‘include’ })
.then(res => {
if (!res.ok) {
window.location.href = ‘/auth/discord’;
throw new Error(‘Not authenticated’);
}
return res.json();
})
.then(data => {
setUser(data);
setLoading(false);
})
.catch(err => {
setError(err.message);
setLoading(false);
});

```
// Fetch stats
fetch('/api/stats', { credentials: 'include' })
  .then(res => res.json())
  .then(data => setStats(data))
  .catch(err => console.error('Failed to fetch stats:', err));

// Fetch initial logs
fetch('/api/logs?limit=100', { credentials: 'include' })
  .then(res => res.json())
  .then(data => setLogs(data))
  .catch(err => console.error('Failed to fetch logs:', err));

// Setup Socket.io
const newSocket = io(window.location.origin, {
  withCredentials: true,
  transports: ['websocket', 'polling']
});

newSocket.on('connect', () => {
  console.log('Connected to server');
});

newSocket.on('log_event', (event) => {
  setLogs(prevLogs => [event, ...prevLogs].slice(0, 100));
});

newSocket.on('log_history', (history) => {
  setLogs(history);
});

newSocket.on('disconnect', () => {
  console.log('Disconnected from server');
});

setSocket(newSocket);

return () => {
  newSocket.close();
};
```

}, []);

const handleLogout = () => {
fetch(’/auth/logout’, {
credentials: ‘include’,
redirect: ‘follow’
})
.then(() => {
window.location.href = ‘/’;
})
.catch(err => console.error(‘Logout failed:’, err));
};

const formatTimestamp = (timestamp) => {
return new Date(timestamp).toLocaleString();
};

const getLogColor = (type) => {
const colors = {
‘warning’: ‘#ff9900’,
‘ban’: ‘#ff0000’,
‘kick’: ‘#ff6600’,
‘timeout’: ‘#ff9900’,
‘automod_action’: ‘#ff9900’,
‘automod_timeout’: ‘#ff0000’,
‘moderation’: ‘#0099ff’
};
return colors[type] || ‘#666666’;
};

const getLogIcon = (type) => {
const icons = {
‘warning’: ‘⚠️’,
‘ban’: ‘🔨’,
‘kick’: ‘👢’,
‘timeout’: ‘🔇’,
‘automod_action’: ‘🤖’,
‘automod_timeout’: ‘🤖🔇’,
‘moderation’: ‘⚖️’
};
return icons[type] || ‘📝’;
};

if (loading) {
return (
<div className="loading-container">
<div className="spinner"></div>
<p>Loading dashboard…</p>
</div>
);
}

if (error) {
return (
<div className="error-container">
<h2>Error</h2>
<p>{error}</p>
<button onClick={() => window.location.href = ‘/auth/discord’}>
Login with Discord
</button>
</div>
);
}

return (
<div className="dashboard">
<header className="dashboard-header">
<div className="header-left">
<h1>🛡️ ShadyBot Dashboard</h1>
</div>
<div className="header-right">
{user && (
<>
<div className="user-info">
<img
src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
alt={user.username}
className=“user-avatar”
/>
<span className="user-name">{user.username}</span>
</div>
<button onClick={handleLogout} className="logout-btn">
Logout
</button>
</>
)}
</div>
</header>

```
  <div className="dashboard-nav">
    <button 
      className={activeTab === 'overview' ? 'active' : ''}
      onClick={() => setActiveTab('overview')}
    >
      📊 Overview
    </button>
    <button 
      className={activeTab === 'logs' ? 'active' : ''}
      onClick={() => setActiveTab('logs')}
    >
      📋 Logs
    </button>
    <button 
      className={activeTab === 'automod' ? 'active' : ''}
      onClick={() => setActiveTab('automod')}
    >
      🤖 AutoMod
    </button>
  </div>

  <main className="dashboard-content">
    {activeTab === 'overview' && (
      <div className="overview-section">
        <h2>Server Statistics</h2>
        {stats ? (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">⚠️</div>
              <div className="stat-info">
                <div className="stat-value">{stats.totalWarnings || 0}</div>
                <div className="stat-label">Active Warnings</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-info">
                <div className="stat-value">{stats.totalLogs || 0}</div>
                <div className="stat-label">Total Logs</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">👑</div>
              <div className="stat-info">
                <div className="stat-value">{stats.totalAdmins || 0}</div>
                <div className="stat-label">Admins</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⏱️</div>
              <div className="stat-info">
                <div className="stat-value">
                  {Math.floor(stats.uptime / 3600)}h
                </div>
                <div className="stat-label">Uptime</div>
              </div>
            </div>
          </div>
        ) : (
          <p>Loading statistics...</p>
        )}

        <h2 style={{ marginTop: '2rem' }}>Recent Activity</h2>
        <div className="recent-logs">
          {logs.slice(0, 5).map((log, index) => (
            <div 
              key={log.id || index} 
              className="log-item-compact"
              style={{ borderLeftColor: getLogColor(log.type) }}
            >
              <span className="log-icon">{getLogIcon(log.type)}</span>
              <div className="log-details">
                <span className="log-type">{log.type}</span>
                {log.reason && <span className="log-reason">• {log.reason}</span>}
              </div>
              <span className="log-time">
                {formatTimestamp(log.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {activeTab === 'logs' && (
      <div className="logs-section">
        <div className="section-header">
          <h2>Moderation Logs</h2>
          <div className="log-filters">
            <input 
              type="text" 
              placeholder="Search logs..."
              className="search-input"
            />
            <select className="filter-select">
              <option value="all">All Types</option>
              <option value="warning">Warnings</option>
              <option value="ban">Bans</option>
              <option value="kick">Kicks</option>
              <option value="timeout">Timeouts</option>
              <option value="automod_action">AutoMod</option>
            </select>
          </div>
        </div>

        <div className="logs-list">
          {logs.map((log, index) => (
            <div 
              key={log.id || index} 
              className="log-item"
              style={{ borderLeftColor: getLogColor(log.type) }}
            >
              <div className="log-header">
                <span className="log-icon-large">{getLogIcon(log.type)}</span>
                <div className="log-info">
                  <span className="log-type-badge">{log.type}</span>
                  <span className="log-timestamp">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              </div>
              
              <div className="log-body">
                {log.userId && (
                  <div className="log-field">
                    <strong>User:</strong> {log.userId}
                  </div>
                )}
                {log.moderatorId && (
                  <div className="log-field">
                    <strong>Moderator:</strong> {log.moderatorId}
                  </div>
                )}
                {log.reason && (
                  <div className="log-field">
                    <strong>Reason:</strong> {log.reason}
                  </div>
                )}
                {log.content && (
                  <div className="log-field">
                    <strong>Content:</strong> 
                    <span className="log-content">{log.content}</span>
                  </div>
                )}
                {log.guildId && (
                  <div className="log-field">
                    <strong>Server:</strong> {log.guildId}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {activeTab === 'automod' && (
      <div className="automod-section">
        <h2>AutoMod Configuration</h2>
        <p className="section-description">
          Configure automatic moderation settings for your servers
        </p>
        
        <div className="automod-info">
          <div className="info-card">
            <h3>🤖 What is AutoMod?</h3>
            <p>
              AutoMod automatically monitors and moderates messages based on 
              configured rules. It can detect spam, bad words, excessive caps, 
              invite links, and more.
            </p>
          </div>
          
          <div className="info-card">
            <h3>⚙️ Configuration</h3>
            <p>
              Use the <code>/automod</code> command in your Discord server to 
              configure AutoMod settings. Available commands:
            </p>
            <ul>
              <li><code>/automod view</code> - View current settings</li>
              <li><code>/automod toggle</code> - Enable/disable AutoMod</li>
            </ul>
          </div>

          <div className="info-card">
            <h3>🛡️ Features</h3>
            <ul>
              <li>Bad word filtering</li>
              <li>Spam detection</li>
              <li>Invite link blocking</li>
              <li>Excessive caps detection</li>
              <li>Mention spam protection</li>
              <li>Custom URL filtering</li>
            </ul>
          </div>
        </div>
      </div>
    )}
  </main>

  <footer className="dashboard-footer">
    <p>ShadyBot v2.0 • Made with ❤️ for your Discord server</p>
    <div className="footer-links">
      <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
        Discord
      </a>
      <span>•</span>
      <a href="https://github.com" target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
    </div>
  </footer>
</div>
```

);
};

export default AdminDashboard;
