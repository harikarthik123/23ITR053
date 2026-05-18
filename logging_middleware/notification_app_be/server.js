const express = require('express');
const cors = require('cors');
const { log } = require('./logger');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    log('api.notification', 'error', 'notification-service', `invalid JSON payload: ${err.message}`);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next(err);
});

const notifications = [];
const subscriptions = [];
const sseClients = [];

function generateId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendSse(client, event, data) {
  client.res.write(`event: ${event}\n`);
  client.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastNotificationEvent(notification) {
  sseClients.forEach((client) => {
    if (notification.recipients.includes(`student:${client.userId}`) || notification.recipients.includes('all')) {
      sendSse(client, 'notification', notification);
      log('realtime.socket', 'info', 'notification-service', `sent SSE notification ${notification.notificationId} to student:${client.userId}`);
    }
  });
}

app.get('/api/v1/notifications', (req, res) => {
  const { userId, status, category, page = 1, pageSize = 20 } = req.query;
  log('api.notification', 'info', 'notification-service', `fetch notifications request userId=${userId} status=${status} category=${category} page=${page}`);

  let items = notifications.filter((item) => {
    const matchesUser = !userId || item.recipients.includes(`student:${userId}`);
    const matchesStatus = !status || (status === 'unread' ? !item.read : status === 'read' ? item.read : true);
    const matchesCategory = !category || item.category === category;
    return matchesUser && matchesStatus && matchesCategory;
  });

  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + Number(pageSize));

  log('service.notification', 'debug', 'notification-service', `returning ${paged.length} notifications for userId=${userId}`);
  res.json({ items: paged, page: Number(page), pageSize: Number(pageSize), total: items.length });
});

app.get('/api/v1/notifications/stream', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required for SSE stream' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('\n');

  const client = { userId, res };
  sseClients.push(client);
  log('realtime.socket', 'info', 'notification-service', `SSE client connected for userId=${userId} totalClients=${sseClients.length}`);

  req.on('close', () => {
    const index = sseClients.indexOf(client);
    if (index !== -1) {
      sseClients.splice(index, 1);
      log('realtime.socket', 'info', 'notification-service', `SSE client disconnected userId=${userId} totalClients=${sseClients.length}`);
    }
  });
});

app.post('/api/v1/notifications', (req, res) => {
  const payload = req.body;
  log('api.notification', 'info', 'notification-service', `create notification request received payload=${JSON.stringify(payload)}`);

  if (!payload.title || !payload.message || !payload.category || !Array.isArray(payload.recipients) || payload.recipients.length === 0) {
    log('api.notification', 'error', 'notification-service', 'invalid create payload: missing required fields');
    return res.status(400).json({ error: 'title, message, category, and recipients are required' });
  }

  const notification = {
    notificationId: generateId('notif'),
    title: payload.title,
    message: payload.message,
    category: payload.category,
    priority: payload.priority || 'normal',
    recipients: payload.recipients,
    metadata: payload.metadata || {},
    createdAt: new Date().toISOString(),
    delivered: false,
    read: false,
    acknowledged: false,
  };

  notifications.push(notification);
  broadcastNotificationEvent(notification);
  log('service.notification', 'info', 'notification-service', `queued notification ${notification.notificationId} for recipients=${notification.recipients.length}`);
  res.status(201).json({ notificationId: notification.notificationId, createdAt: notification.createdAt, status: 'queued' });
});

app.patch('/api/v1/notifications/:notificationId/read', (req, res) => {
  const { notificationId } = req.params;
  log('api.notification', 'info', 'notification-service', `mark notification ${notificationId} as read`);

  const notification = notifications.find((item) => item.notificationId === notificationId);
  if (!notification) {
    log('api.notification', 'warn', 'notification-service', `notification ${notificationId} not found for read update`);
    return res.status(404).json({ error: 'notification not found' });
  }

  notification.read = true;
  notification.readAt = new Date().toISOString();
  log('service.notification', 'info', 'notification-service', `notification ${notificationId} marked read successfully`);
  res.json({ notificationId, read: true, readAt: notification.readAt });
});

app.patch('/api/v1/notifications/:notificationId/acknowledge', (req, res) => {
  const { notificationId } = req.params;
  log('api.notification', 'info', 'notification-service', `acknowledge notification ${notificationId}`);

  const notification = notifications.find((item) => item.notificationId === notificationId);
  if (!notification) {
    log('api.notification', 'warn', 'notification-service', `notification ${notificationId} not found for acknowledge`);
    return res.status(404).json({ error: 'notification not found' });
  }

  notification.acknowledged = true;
  notification.acknowledgedAt = new Date().toISOString();
  res.json({ notificationId, acknowledged: true, acknowledgedAt: notification.acknowledgedAt });
});

app.post('/api/v1/notification-subscriptions', (req, res) => {
  const payload = req.body;
  log('api.notification', 'info', 'notification-service', `subscribe request payload=${JSON.stringify(payload)}`);

  if (!payload.topic || !Array.isArray(payload.channels) || payload.channels.length === 0) {
    log('api.notification', 'error', 'notification-service', 'invalid subscription payload');
    return res.status(400).json({ error: 'topic and channels are required' });
  }

  const subscription = {
    subscriptionId: generateId('sub'),
    topic: payload.topic,
    channels: payload.channels,
    active: true,
    createdAt: new Date().toISOString(),
  };

  subscriptions.push(subscription);
  log('service.notification', 'info', 'notification-service', `created subscription ${subscription.subscriptionId} for topic=${subscription.topic}`);
  res.status(201).json(subscription);
});

app.delete('/api/v1/notification-subscriptions/:subscriptionId', (req, res) => {
  const { subscriptionId } = req.params;
  log('api.notification', 'info', 'notification-service', `unsubscribe request ${subscriptionId}`);

  const subscription = subscriptions.find((item) => item.subscriptionId === subscriptionId);
  if (!subscription) {
    log('api.notification', 'warn', 'notification-service', `subscription ${subscriptionId} not found`);
    return res.status(404).json({ error: 'subscription not found' });
  }

  subscription.active = false;
  subscription.deactivatedAt = new Date().toISOString();
  res.json({ subscriptionId, active: false });
});

app.post('/api/v1/notifications/broadcast', (req, res) => {
  const payload = req.body;
  log('api.notification', 'info', 'notification-service', `broadcast request payload=${JSON.stringify(payload)}`);

  if (!payload.title || !payload.message || !payload.category || !Array.isArray(payload.recipients) || payload.recipients.length === 0) {
    log('api.notification', 'error', 'notification-service', 'invalid broadcast payload');
    return res.status(400).json({ error: 'title, message, category, and recipients are required' });
  }

  const notification = {
    notificationId: generateId('notif'),
    title: payload.title,
    message: payload.message,
    category: payload.category,
    priority: payload.priority || 'normal',
    recipients: payload.recipients,
    metadata: payload.metadata || {},
    createdAt: new Date().toISOString(),
    delivered: false,
    read: false,
    acknowledged: false,
  };

  notifications.push(notification);
  broadcastNotificationEvent(notification);
  log('service.notification', 'info', 'notification-service', `broadcast queued ${notification.notificationId} recipients=${notification.recipients.length}`);
  res.status(201).json({ broadcastId: notification.notificationId, status: 'sent' });
});

app.get('/api/v1/notifications/:notificationId/status', (req, res) => {
  const { notificationId } = req.params;
  log('api.notification', 'info', 'notification-service', `status check for notification ${notificationId}`);

  const notification = notifications.find((item) => item.notificationId === notificationId);
  if (!notification) {
    log('api.notification', 'warn', 'notification-service', `notification ${notificationId} not found for status`);
    return res.status(404).json({ error: 'notification not found' });
  }

  res.json({
    notificationId,
    delivered: notification.delivered,
    read: notification.read,
    deliveredAt: notification.deliveredAt || null,
    readAt: notification.readAt || null,
  });
});

app.delete('/api/v1/notifications/:notificationId', (req, res) => {
  const { notificationId } = req.params;
  log('api.notification', 'info', 'notification-service', `delete notification ${notificationId}`);

  const index = notifications.findIndex((item) => item.notificationId === notificationId);
  if (index === -1) {
    log('api.notification', 'warn', 'notification-service', `notification ${notificationId} not found for delete`);
    return res.status(404).json({ error: 'notification not found' });
  }

  notifications.splice(index, 1);
  res.json({ notificationId, deleted: true });
});

app.listen(port, () => {
  log('api.notification', 'info', 'notification-service', `notification API started on port ${port}`);
});
