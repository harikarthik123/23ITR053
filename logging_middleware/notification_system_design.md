stage 1

core actions:
create notification
fetch notifications for logged in student
mark notification read
acknowledge notification
subscribe to notifications
unsubscribe from notifications
broadcast notification to groups
delete invalid notification
check delivery status

rest api contract:
POST /api/v1/notifications
GET /api/v1/notifications
PATCH /api/v1/notifications/{notificationId}/read
PATCH /api/v1/notifications/{notificationId}/acknowledge
POST /api/v1/notification-subscriptions
DELETE /api/v1/notification-subscriptions/{subscriptionId}
POST /api/v1/notifications/broadcast
GET /api/v1/notifications/{notificationId}/status
DELETE /api/v1/notifications/{notificationId}

notification payload:
{
  "title": "Placement Drive Open",
  "message": "A new placement drive by Acme Corp is now open for CS students.",
  "category": "placements",
  "priority": "high",
  "recipients": ["student:123", "batch:2026", "role:final-year"],
  "metadata": { "companyId": "acme-corp", "eventId": "event-789" }
}

response example:
{
  "notificationId": "notif-001",
  "createdAt": "2026-05-18T14:00:00Z",
  "status": "queued"
}

logging middleware:
use log(stack, level, package, message)
example:
log('api.notification', 'info', 'notification-service', 'received create notification request for userId: 123')
log('service.notification', 'debug', 'notification-service', 'validated notification payload for category: placements')
log('realtime.socket', 'info', 'notification-service', 'pushed notification to connected student sockets')
log('db.notifications', 'error', 'notification-service', 'failed to persist notification record')

payload fields:
title, message, category, priority, recipients, metadata, createdAt, read, acknowledged

student flow:
students login
student fetches notifications
student sees placement, event, result updates
student marks notifications read
real time push delivers urgent placement and result updates
subscription management lets students opt into topics
