const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'meeting_request', 'meeting_accepted', 'meeting_rejected', 'meeting_cancelled',
        'meeting_reminder', 'document_shared', 'document_signed', 'payment_received',
        'payment_sent', 'new_message', 'profile_view', 'system',
      ],
      required: true,
    },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    data:    { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead:  { type: Boolean, default: false },
    readAt:  { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
