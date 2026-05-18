function log(stack, level, packageName, message) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    stack,
    level,
    package: packageName,
    message,
  };
  console.log(JSON.stringify(entry));
}

module.exports = { log };

// Example usage:
// const { log } = require('./logger');
// log('api.notification', 'info', 'notification-service', 'received create notification request for userId: 123');
