const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/meetingController');
const { protect } = require('../middleware/auth');
const { meetingValidation, validate } = require('../middleware/validate');
const { body } = require('express-validator');

router.use(protect);

router.get('/', ctrl.getMyMeetings);
router.get('/upcoming', ctrl.getUpcomingMeetings);
router.get('/available-slots', ctrl.getAvailableSlots);
router.post('/', meetingValidation, validate, ctrl.createMeeting);
router.get('/:id', ctrl.getMeeting);
router.put('/:id', ctrl.updateMeeting);
router.post(
  '/:id/respond',
  [body('action').isIn(['accept', 'reject', 'cancel'])],
  validate,
  ctrl.respondToMeeting
);

module.exports = router;
