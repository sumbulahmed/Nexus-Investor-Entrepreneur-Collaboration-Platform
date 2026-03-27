const Notification = require('../models/Notification');

const createNotification = async ({ recipient, type, title, message, data = {} }) => {
  try {
    const notification = await Notification.create({ recipient, type, title, message, data });
    return notification;
  } catch (err) {
    console.error('Notification creation failed:', err.message);
  }
};

const markAsRead = async (notificationId, userId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
};

const markAllAsRead = async (userId) => {
  return Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ recipient: userId, isRead: false });
};

module.exports = { createNotification, markAsRead, markAllAsRead, getUnreadCount };
