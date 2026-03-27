const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

/**
 * @swagger
 * components:
 *   schemas:
 *     Meeting:
 *       type: object
 *       properties:
 *         _id:         { type: string }
 *         title:       { type: string }
 *         description: { type: string }
 *         organizer:   { type: string, description: User ID }
 *         attendees:   { type: array, items: { type: string } }
 *         startTime:   { type: string, format: date-time }
 *         endTime:     { type: string, format: date-time }
 *         status:      { type: string, enum: [pending, accepted, rejected, cancelled, completed] }
 *         meetingLink: { type: string }
 *         type:        { type: string, enum: [video, in-person] }
 */
const meetingSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 2000, default: '' },
    agenda:      { type: String, maxlength: 5000, default: '' },

    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    startTime: { type: Date, required: true },
    endTime:   { type: Date, required: true },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
    },

    type: { type: String, enum: ['video', 'in-person'], default: 'video' },

    // Video call integration
    roomId:      { type: String, default: '' },
    meetingLink: { type: String, default: '' },

    // Location for in-person
    location: { type: String, default: '' },

    // Notes / attachments
    notes:       { type: String, maxlength: 5000, default: '' },
    attachments: [{ name: String, url: String, uploadedAt: Date }],

    // Conflict detection helper
    isActive: { type: Boolean, default: true },

    // Rejection / cancellation reason
    reason: { type: String, default: '' },

    // Notification flags
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────
meetingSchema.index({ organizer: 1, startTime: 1 });
meetingSchema.index({ attendees: 1, startTime: 1 });
meetingSchema.index({ startTime: 1, endTime: 1 });

// ─── Virtuals ─────────────────────────────────────────────
meetingSchema.virtual('duration').get(function () {
  return Math.round((this.endTime - this.startTime) / (1000 * 60)); // minutes
});

meetingSchema.set('toJSON', { virtuals: true });
meetingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Meeting', meetingSchema);
