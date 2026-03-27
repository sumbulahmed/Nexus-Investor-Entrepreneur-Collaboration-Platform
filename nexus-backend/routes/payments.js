const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { paymentValidation, transferValidation, validate } = require('../middleware/validate');

// Stripe webhook (raw body, no auth middleware)
router.post('/webhook', ctrl.stripeWebhook);

router.use(protect);

router.get('/', ctrl.getTransactions);
router.get('/wallet', ctrl.getWalletSummary);
router.post('/deposit', paymentValidation, validate, ctrl.createDeposit);
router.post('/withdraw', paymentValidation, validate, ctrl.withdraw);
router.post('/transfer', transferValidation, validate, ctrl.transferFunds);

module.exports = router;
