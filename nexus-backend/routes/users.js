const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/upload');
const { profileValidation, validate } = require('../middleware/validate');
const { body } = require('express-validator');

router.use(protect);

router.get('/', userCtrl.getUsers);
router.get('/dashboard-stats', userCtrl.getDashboardStats);
router.get('/:id', userCtrl.getUser);

router.put('/profile', profileValidation, validate, userCtrl.updateProfile);
router.post('/avatar', avatarUpload.single('avatar'), userCtrl.uploadAvatar);
router.put(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  validate,
  userCtrl.changePassword
);
router.post('/deactivate', userCtrl.deactivateAccount);

// Admin only
router.delete('/:id', authorize('admin'), userCtrl.deleteUser);

module.exports = router;
