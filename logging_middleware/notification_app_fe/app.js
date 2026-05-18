const apiBase = 'http://localhost:4000/api/v1';
let eventSource = null;

const studentIdInput = document.getElementById('studentId');
const connectBtn = document.getElementById('connectBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusEl = document.getElementById('status');
const notificationList = document.getElementById('notificationList');
const unreadCountEl = document.getElementById('unreadCount');
const totalCountEl = document.getElementById('totalCount');

async function fetchNotifications() {
  const studentId = studentIdInput.value.trim();
  if (!studentId) return;

  setStatus('Fetching notifications...');
  const response = await fetch(`${apiBase}/notifications?userId=${studentId}&status=unread&page=1&pageSize=50`);
  const data = await response.json();
  renderNotifications(data.items || []);
  setStatus('Loaded notifications');
}

function renderNotifications(items) {
  notificationList.innerHTML = '';
  const unreadCount = items.filter((item) => !item.read).length;

  unreadCountEl.textContent = unreadCount;
  totalCountEl.textContent = items.length;

  if (items.length === 0) {
    notificationList.innerHTML = '<li>No notifications yet. Connect to receive live updates.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="notification-title">${item.title}</div>
      <div>${item.message}</div>
      <div class="notification-meta">
        <span>Category: ${item.category}</span>
        <span>Priority: ${item.priority}</span>
        <span>Received: ${new Date(item.createdAt).toLocaleString()}</span>
      </div>
    `;
    notificationList.appendChild(li);
  });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function connectSse() {
  const studentId = studentIdInput.value.trim();
  if (!studentId) return;

  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${apiBase}/notifications/stream?userId=${studentId}`);

  eventSource.addEventListener('open', () => {
    setStatus('Connected to live updates');
  });

  eventSource.addEventListener('notification', (event) => {
    const data = JSON.parse(event.data);
    setStatus('New notification received');
    prependNotification(data);
  });

  eventSource.addEventListener('error', () => {
    setStatus('Live update connection closed');
    eventSource.close();
    eventSource = null;
  });
}

function prependNotification(notification) {
  const li = document.createElement('li');
  li.innerHTML = `
    <div class="notification-title">${notification.title}</div>
    <div>${notification.message}</div>
    <div class="notification-meta">
      <span>Category: ${notification.category}</span>
      <span>Priority: ${notification.priority}</span>
      <span>Received: ${new Date(notification.createdAt).toLocaleString()}</span>
    </div>
  `;

  notificationList.prepend(li);
  unreadCountEl.textContent = Number(unreadCountEl.textContent || '0') + 1;
  totalCountEl.textContent = Number(totalCountEl.textContent || '0') + 1;
}

connectBtn.addEventListener('click', () => {
  connectSse();
  fetchNotifications();
});
refreshBtn.addEventListener('click', fetchNotifications);

setStatus('Ready. Enter student ID and click Connect.');
//last line 