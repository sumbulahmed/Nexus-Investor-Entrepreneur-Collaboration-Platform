// ─── video.js ──────────────────────────────────────────────
const express = require('express');
const videoRouter = express.Router();
const videoCtrl = require('../controllers/videoController');
const { protect } = require('../middleware/auth');

videoRouter.use(protect);
videoRouter.post('/room', videoCtrl.createRoom);
videoRouter.get('/room/:roomId', videoCtrl.getRoomInfo);

module.exports = videoRouter;
