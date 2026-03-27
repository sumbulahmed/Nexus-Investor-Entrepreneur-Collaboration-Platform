const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { createNotification } = require('../utils/notificationService');
const { sendMeetingRequestEmail, sendMeetingStatusEmail } = require('../utils/emailService');
const { v4: uuidv4 } = require('uuid');

// ─── Conflict detection helper ────────────────────────────
const hasConflict = async (userId, startTime, endTime, excludeId = null) => {
  const query = {
    $or: [{ organizer: userId }, { attendees: userId }],
    status: { $in: ['pending', 'accepted'] },
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Meeting.exists(query);
};

// ─── Create meeting ───────────────────────────────────────
exports.createMeeting = async (req, res) => {
  try {
    const { title, description, attendeeId, startTime, endTime, type, location, agenda } = req.body;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) return sendError(res, 'End time must be after start time', 400);
    if (start < new Date()) return sendError(res, 'Cannot schedule meetings in the past', 400);
    const durationMin = (end - start) / (1000 * 60);
    if (durationMin < 15) return sendError(res, 'Meeting must be at least 15 minutes', 400);
    if (durationMin > 480) return sendError(res, 'Meeting cannot exceed 8 hours', 400);

    // Check attendee exists
    const attendee = await User.findById(attendeeId);
    if (!attendee) return sendError(res, 'Attendee not found', 404);
    if (attendeeId === req.user._id.toString()) {
      return sendError(res, 'Cannot schedule a meeting with yourself', 400);
    }

    // Conflict detection for both parties
    const [organizerConflict, attendeeConflict] = await Promise.all([
      hasConflict(req.user._id, start, end),
      hasConflict(attendeeId, start, end),
    ]);

    if (organizerConflict) return sendError(res, 'You have a conflicting meeting at this time', 409);
    if (attendeeConflict) return sendError(res, 'The attendee has a conflicting meeting at this time', 409);

    const roomId = uuidv4();
    const meeting = await Meeting.create({
      title,
      description,
      agenda,
      organizer: req.user._id,
      attendees: [attendeeId],
      startTime: start,
      endTime: end,
      type: type || 'video',
      location: location || '',
      roomId,
      meetingLink: type !== 'in-person' ? `${process.env.CLIENT_URL}/video/${roomId}` : '',
    });

    await meeting.populate('organizer attendees', 'firstName lastName email avatar');

    // Notify attendee
    await createNotification({
      recipient: attendeeId,
      type: 'meeting_request',
      title: 'New Meeting Request',
      message: `${req.user.firstName} ${req.user.lastName} wants to meet: "${title}"`,
      data: { meetingId: meeting._id },
    });

    sendMeetingRequestEmail(attendee, req.user, meeting).catch(console.error);

    return sendSuccess(res, { meeting }, 'Meeting scheduled successfully', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get meetings for current user ────────────────────────
exports.getMyMeetings = async (req, res) => {
  try {
    const { status, type, from, to, page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    const filter = {
      $or: [{ organizer: userId }, { attendees: userId }],
    };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to) filter.startTime.$lte = new Date(to);
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { startTime: 1 },
      populate: [
        { path: 'organizer', select: 'firstName lastName avatar role' },
        { path: 'attendees', select: 'firstName lastName avatar role' },
      ],
    };

    const result = await Meeting.paginate(filter, options);
    return sendPaginated(res, result.docs, {
      total: result.totalDocs, pages: result.totalPages,
      current: result.page, limit: result.limit,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get single meeting ───────────────────────────────────
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('organizer attendees', 'firstName lastName email avatar role');
    if (!meeting) return sendError(res, 'Meeting not found', 404);

    const isParticipant =
      meeting.organizer._id.equals(req.user._id) ||
      meeting.attendees.some((a) => a._id.equals(req.user._id));

    if (!isParticipant && req.user.role !== 'admin') {
      return sendError(res, 'Access denied', 403);
    }
    return sendSuccess(res, { meeting });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Update meeting ───────────────────────────────────────
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return sendError(res, 'Meeting not found', 404);
    if (!meeting.organizer.equals(req.user._id)) return sendError(res, 'Only the organizer can edit this meeting', 403);
    if (['cancelled', 'completed', 'rejected'].includes(meeting.status)) {
      return sendError(res, 'Cannot edit a closed meeting', 400);
    }

    const { title, description, agenda, notes } = req.body;
    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (agenda !== undefined) meeting.agenda = agenda;
    if (notes !== undefined) meeting.notes = notes;
    await meeting.save();
    await meeting.populate('organizer attendees', 'firstName lastName avatar');

    return sendSuccess(res, { meeting }, 'Meeting updated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Accept / reject / cancel ─────────────────────────────
exports.respondToMeeting = async (req, res) => {
  try {
    const { action, reason } = req.body; // action: accept | reject | cancel
    if (!['accept', 'reject', 'cancel'].includes(action)) {
      return sendError(res, 'Action must be accept, reject, or cancel', 400);
    }

    const meeting = await Meeting.findById(req.params.id)
      .populate('organizer attendees', 'firstName lastName email');
    if (!meeting) return sendError(res, 'Meeting not found', 404);

    const isAttendee = meeting.attendees.some((a) => a._id.equals(req.user._id));
    const isOrganizer = meeting.organizer._id.equals(req.user._id);

    if (action === 'cancel' && !isOrganizer) {
      return sendError(res, 'Only the organizer can cancel', 403);
    }
    if ((action === 'accept' || action === 'reject') && !isAttendee) {
      return sendError(res, 'Only attendees can accept or reject', 403);
    }

    const statusMap = { accept: 'accepted', reject: 'rejected', cancel: 'cancelled' };
    meeting.status = statusMap[action];
    if (reason) meeting.reason = reason;
    await meeting.save();

    // Notifications
    const notifTarget = action === 'cancel' ? meeting.attendees[0]._id : meeting.organizer._id;
    const notifType = `meeting_${statusMap[action]}`;
    const notifMsg = {
      accepted: `${req.user.firstName} accepted your meeting "${meeting.title}"`,
      rejected: `${req.user.firstName} declined your meeting "${meeting.title}"`,
      cancelled: `Meeting "${meeting.title}" has been cancelled`,
    }[statusMap[action]];

    await createNotification({
      recipient: notifTarget,
      type: notifType,
      title: `Meeting ${statusMap[action]}`,
      message: notifMsg,
      data: { meetingId: meeting._id },
    });

    if (action !== 'cancel') {
      sendMeetingStatusEmail(meeting.organizer, meeting, statusMap[action]).catch(console.error);
    }

    return sendSuccess(res, { meeting }, `Meeting ${statusMap[action]}`);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get available time slots ─────────────────────────────
exports.getAvailableSlots = async (req, res) => {
  try {
    const { userId, date } = req.query;
    if (!userId || !date) return sendError(res, 'userId and date are required', 400);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const meetings = await Meeting.find({
      $or: [{ organizer: userId }, { attendees: userId }],
      status: { $in: ['pending', 'accepted'] },
      startTime: { $gte: dayStart, $lte: dayEnd },
    }).select('startTime endTime');

    // Generate 30-min slots from 09:00 to 17:00
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, min, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

        const busy = meetings.some(
          (m) => slotStart < m.endTime && slotEnd > m.startTime
        );
        slots.push({ start: slotStart, end: slotEnd, available: !busy });
      }
    }

    return sendSuccess(res, { slots });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Upcoming meetings count ──────────────────────────────
exports.getUpcomingMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [{ organizer: req.user._id }, { attendees: req.user._id }],
      status: 'accepted',
      startTime: { $gte: new Date() },
    })
      .sort({ startTime: 1 })
      .limit(5)
      .populate('organizer attendees', 'firstName lastName avatar');

    return sendSuccess(res, { meetings });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
