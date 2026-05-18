import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const apiBase = 'http://localhost:4000/api/v1';

function buildNotificationHtml(notification) {
  return (
    <li key={notification.notificationId} className="notification-item">
      <div className="notification-title">{notification.title}</div>
      <div className="notification-message">{notification.message}</div>
      <div className="notification-meta">
        <span>Category: {notification.category}</span>
        <span>Priority: {notification.priority}</span>
        <span>Received: {new Date(notification.createdAt).toLocaleString()}</span>
      </div>
    </li>
  );
}

function App() {
  const [studentId, setStudentId] = useState('123');
  const [notifications, setNotifications] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [eventSource, setEventSource] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('placements');
  const [recipients, setRecipients] = useState('student:123');

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  async function fetchNotifications() {
    if (!studentId) return;
    setStatus('Loading latest notifications...');
    try {
      const response = await fetch(
        `${apiBase}/notifications?userId=${encodeURIComponent(studentId)}&status=unread&page=1&pageSize=50`
      );
      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }
      const { items } = await response.json();
      setNotifications(items || []);
      setStatus('Notifications loaded');
    } catch (error) {
      console.error(error);
      setStatus('Error loading notifications');
    }
  }

  function connectLiveUpdates() {
    if (!studentId) {
      setStatus('Enter a valid student ID');
      return;
    }

    if (eventSource) {
      eventSource.close();
    }

    const source = new EventSource(`${apiBase}/notifications/stream?userId=${encodeURIComponent(studentId)}`);

    source.addEventListener('open', () => {
      setStatus('Connected to live updates');
      setIsConnected(true);
    });

    source.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data);
      setNotifications((previous) => [notification, ...previous]);
      setStatus('New notification received');
    });

    source.addEventListener('error', () => {
      setStatus('Live update connection closed');
      setIsConnected(false);
      source.close();
    });

    setEventSource(source);
  }

  async function createNotification() {
    if (!title || !message || !category || !recipients) {
      setStatus('Fill in title, message, category, and recipients');
      return;
    }

    const payload = {
      title,
      message,
      category,
      priority: 'high',
      recipients: recipients.split(',').map((item) => item.trim()),
    };

    try {
      const response = await fetch(`${apiBase}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to create notification');
      }

      const result = await response.json();
      setStatus(`Notification created ${result.notificationId}`);
      setTitle('');
      setMessage('');
      setRecipients(`student:${studentId}`);
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    }
  }

  function handleConnectClick() {
    connectLiveUpdates();
    fetchNotifications();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Student Notification Center</h1>
          <p>Live placement, event, and result updates without repeated page reloads.</p>
        </div>
      </header>

      <section className="controls">
        <label htmlFor="studentId">Student ID</label>
        <input
          id="studentId"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="Enter student ID"
        />
        <button onClick={handleConnectClick}>Connect</button>
        <button onClick={fetchNotifications}>Refresh</button>
        <span className="status-badge">{status}</span>
      </section>

      <section className="summary-cards">
        <div className="card">
          <strong>Unread</strong>
          <span>{unreadCount}</span>
        </div>
        <div className="card">
          <strong>Total Loaded</strong>
          <span>{notifications.length}</span>
        </div>
        <div className="card">
          <strong>Connection</strong>
          <span>{isConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </section>

      <section className="admin-form">
        <h2>Create Notification</h2>
        <div className="form-row">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="placements">placements</option>
            <option value="events">events</option>
            <option value="results">results</option>
          </select>
        </div>
        <div className="form-row">
          <label>Recipients</label>
          <input
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="student:123, batch:2026, all"
          />
        </div>
        <button className="create-button" onClick={createNotification}>
          Send Notification
        </button>
      </section>

      <section className="notifications">
        <h2>Notifications</h2>
        <ul>
          {notifications.length === 0 ? (
            <li className="empty-state">No notifications yet. Connect to receive updates.</li>
          ) : (
            notifications.map((notification) => buildNotificationHtml(notification))
          )}
        </ul>
      </section>
    </div>
  );
}

export default App;
