const { body, param, query, validationResult } = require('express-validator');
const { sendError } = require('../utils/response');

// ─── Run validations and catch errors ─────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join(', ');
    return sendError(res, msg, 422);
  }
  next();
};

// ─── Auth validators ──────────────────────────────────────
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 50 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 50 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('role').isIn(['investor', 'entrepreneur']).withMessage('Role must be investor or entrepreneur'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Meeting validators ───────────────────────────────────
const meetingValidation = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('attendeeId').isMongoId().withMessage('Valid attendee ID required'),
  body('startTime').isISO8601().withMessage('Valid start time (ISO 8601) required'),
  body('endTime').isISO8601().withMessage('Valid end time (ISO 8601) required'),
  body('type').optional().isIn(['video', 'in-person']).withMessage('Type must be video or in-person'),
];

// ─── Payment validators ───────────────────────────────────
const paymentValidation = [
  body('amount')
    .isFloat({ min: 1 }).withMessage('Amount must be a positive number'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'PKR']).withMessage('Unsupported currency'),
];

const transferValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be positive'),
  body('recipientId').isMongoId().withMessage('Valid recipient ID required'),
  body('description').optional().isLength({ max: 500 }),
];

// ─── Profile validators ───────────────────────────────────
const profileValidation = [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
  body('bio').optional().isLength({ max: 1000 }),
  body('phone').optional().matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number'),
  body('website').optional().isURL().withMessage('Invalid website URL'),
  body('linkedIn').optional().isURL().withMessage('Invalid LinkedIn URL'),
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  meetingValidation,
  paymentValidation,
  transferValidation,
  profileValidation,
};
