const Notification = require('../models/Notification');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { markAsRead, markAllAsRead, getUnreadCount } = require('../utils/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') filter.isRead = false;

    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const unread = await getUnreadCount(req.user._id);

    return sendPaginated(res, notifications, {
      total,
      pages: Math.ceil(total / limit),
      current: Number(page),
      limit: Number(limit),
      unreadCount: unread,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.markRead = async (req, res) => {
  try {
    const notif = await markAsRead(req.params.id, req.user._id);
    if (!notif) return sendError(res, 'Notification not found', 404);
    return sendSuccess(res, { notification: notif }, 'Marked as read');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await markAllAsRead(req.user._id);
    return sendSuccess(res, {}, 'All notifications marked as read');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    return sendSuccess(res, {}, 'Notification deleted');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
