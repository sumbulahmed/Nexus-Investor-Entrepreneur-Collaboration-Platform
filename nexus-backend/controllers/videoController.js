const Meeting = require('../models/Meeting');
const { sendSuccess, sendError } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');

// ─── Get room token/info ───────────────────────────────────
exports.getRoomInfo = async (req, res) => {
  try {
    const { roomId } = req.params;

    // Find associated meeting
    const meeting = await Meeting.findOne({ roomId })
      .populate('organizer attendees', 'firstName lastName avatar');

    if (!meeting) return sendError(res, 'Room not found', 404);

    const isParticipant =
      meeting.organizer._id.equals(req.user._id) ||
      meeting.attendees.some((a) => a._id.equals(req.user._id));

    if (!isParticipant && req.user.role !== 'admin') {
      return sendError(res, 'You are not a participant in this meeting', 403);
    }

    if (meeting.status !== 'accepted') {
      return sendError(res, 'Meeting is not confirmed', 400);
    }

    return sendSuccess(res, {
      roomId,
      meetingId: meeting._id,
      title: meeting.title,
      participants: [meeting.organizer, ...meeting.attendees],
      startTime: meeting.startTime,
      endTime: meeting.endTime,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Create ad-hoc room (not tied to a meeting) ───────────
exports.createRoom = async (req, res) => {
  try {
    const roomId = uuidv4();
    const link = `${process.env.CLIENT_URL}/video/${roomId}`;
    return sendSuccess(res, { roomId, link }, 'Room created', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
