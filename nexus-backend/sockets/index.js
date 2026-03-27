const jwt = require('jsonwebtoken');
const User = require('../models/User');

// In-memory store for active rooms (use Redis in production)
const rooms = new Map();  // roomId => Set of socket ids
const userSockets = new Map(); // userId => socketId

const initSocketHandlers = (io) => {
  // ─── JWT Auth middleware for sockets ──────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('firstName lastName avatar role');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    userSockets.set(userId, socket.id);
    console.log(`🔌 Socket connected: ${socket.user.firstName} (${socket.id})`);

    // Join personal notification room
    socket.join(`user:${userId}`);

    // ─── VIDEO CALL SIGNALING ──────────────────────────

    socket.on('join-room', ({ roomId }) => {
      if (!roomId) return;

      socket.join(roomId);
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(socket.id);

      const participantCount = rooms.get(roomId).size;
      console.log(`📹 ${socket.user.firstName} joined room ${roomId} (${participantCount} total)`);

      // Notify other participants
      socket.to(roomId).emit('user-joined', {
        socketId: socket.id,
        user: {
          id: userId,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          avatar: socket.user.avatar,
        },
      });

      // Send current participants to the joining user
      const participants = [...(rooms.get(roomId) || [])].filter((id) => id !== socket.id);
      socket.emit('room-participants', { participants });
    });

    // WebRTC offer
    socket.on('offer', ({ targetSocketId, sdp }) => {
      socket.to(targetSocketId).emit('offer', {
        sdp,
        fromSocketId: socket.id,
        user: {
          id: userId,
          firstName: socket.user.firstName,
          avatar: socket.user.avatar,
        },
      });
    });

    // WebRTC answer
    socket.on('answer', ({ targetSocketId, sdp }) => {
      socket.to(targetSocketId).emit('answer', { sdp, fromSocketId: socket.id });
    });

    // ICE candidates
    socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
      socket.to(targetSocketId).emit('ice-candidate', { candidate, fromSocketId: socket.id });
    });

    // Toggle audio/video state
    socket.on('media-toggle', ({ roomId, kind, enabled }) => {
      socket.to(roomId).emit('participant-media-toggle', {
        socketId: socket.id,
        userId,
        kind,  // 'audio' | 'video'
        enabled,
      });
    });

    // Screen share
    socket.on('screen-share-start', ({ roomId }) => {
      socket.to(roomId).emit('screen-share-started', { socketId: socket.id, userId });
    });

    socket.on('screen-share-stop', ({ roomId }) => {
      socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id, userId });
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
      handleLeaveRoom(socket, roomId, io);
    });

    // ─── REAL-TIME NOTIFICATIONS ───────────────────────

    socket.on('ping', () => socket.emit('pong'));

    // ─── DISCONNECT ────────────────────────────────────

    socket.on('disconnect', () => {
      userSockets.delete(userId);
      console.log(`❌ Socket disconnected: ${socket.user.firstName} (${socket.id})`);

      // Clean up all rooms
      rooms.forEach((participants, roomId) => {
        if (participants.has(socket.id)) {
          handleLeaveRoom(socket, roomId, io);
        }
      });
    });
  });
};

const handleLeaveRoom = (socket, roomId, io) => {
  socket.leave(roomId);
  const room = rooms.get(roomId);
  if (room) {
    room.delete(socket.id);
    if (room.size === 0) rooms.delete(roomId);
  }

  socket.to(roomId).emit('user-left', {
    socketId: socket.id,
    userId: socket.user._id.toString(),
  });

  console.log(`📤 ${socket.user.firstName} left room ${roomId}`);
};

// ─── Emit notification to a specific user ─────────────────
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId.toString()}`).emit(event, data);
};

module.exports = { initSocketHandlers, emitToUser };
