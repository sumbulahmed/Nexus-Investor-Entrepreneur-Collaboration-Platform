const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
  registerValidation, loginValidation, validate,
} = require('../middleware/validate');
const { body } = require('express-validator');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & 2FA
 */

// Public
router.post('/register', registerValidation, validate, auth.register);
router.post('/login', loginValidation, validate, auth.login);
router.post('/verify-2fa', auth.verify2FA);
router.get('/verify-email/:token', auth.verifyEmail);
router.post('/forgot-password', [body('email').isEmail()], validate, auth.forgotPassword);
router.post(
  '/reset-password/:token',
  [body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)],
  validate,
  auth.resetPassword
);
router.post('/refresh-token', auth.refreshToken);

// Protected
router.use(protect);
router.get('/me', auth.getMe);
router.post('/logout', auth.logout);
router.post('/setup-2fa', auth.setup2FA);
router.post('/confirm-2fa', auth.confirm2FA);
router.post('/disable-2fa', auth.disable2FA);

module.exports = router;
