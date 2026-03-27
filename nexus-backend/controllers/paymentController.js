const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { createNotification } = require('../utils/notificationService');
const { sendPaymentConfirmationEmail } = require('../utils/emailService');

// ─── Create payment intent (deposit) ─────────────────────
exports.createDeposit = async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),   // Stripe uses cents
      currency: currency.toLowerCase(),
      metadata: {
        userId: req.user._id.toString(),
        type: 'deposit',
      },
    });

    // Record pending transaction
    const transaction = await Transaction.create({
      type: 'deposit',
      amount,
      currency,
      to: req.user._id,
      status: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      description: `Deposit via Stripe`,
    });

    return sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction._id,
    }, 'Payment intent created', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Stripe webhook ───────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const txn = await Transaction.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { status: 'completed', stripeChargeId: pi.latest_charge },
          { new: true }
        ).populate('to', 'firstName lastName email');

        if (txn?.to) {
          await createNotification({
            recipient: txn.to._id,
            type: 'payment_received',
            title: 'Deposit Successful',
            message: `$${txn.amount} ${txn.currency} deposited to your account`,
            data: { transactionId: txn._id },
          });
          sendPaymentConfirmationEmail(txn.to, txn).catch(console.error);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await Transaction.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          {
            status: 'failed',
            failureReason: pi.last_payment_error?.message || 'Payment failed',
          }
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// ─── Transfer between users ───────────────────────────────
exports.transferFunds = async (req, res) => {
  try {
    const { recipientId, amount, description = '', currency = 'USD' } = req.body;

    if (recipientId === req.user._id.toString()) {
      return sendError(res, 'Cannot transfer to yourself', 400);
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) return sendError(res, 'Recipient not found', 404);

    // In a real app you'd check wallet balance here
    const transaction = await Transaction.create({
      type: 'transfer',
      amount,
      currency,
      from: req.user._id,
      to: recipientId,
      status: 'completed',   // mock – instant for sandbox
      description: description || `Transfer to ${recipient.firstName} ${recipient.lastName}`,
    });

    await transaction.populate('from to', 'firstName lastName email');

    // Notifications for both parties
    await Promise.all([
      createNotification({
        recipient: recipientId,
        type: 'payment_received',
        title: 'Payment Received',
        message: `${req.user.firstName} sent you $${amount} ${currency}`,
        data: { transactionId: transaction._id },
      }),
      createNotification({
        recipient: req.user._id,
        type: 'payment_sent',
        title: 'Payment Sent',
        message: `You sent $${amount} ${currency} to ${recipient.firstName}`,
        data: { transactionId: transaction._id },
      }),
    ]);

    sendPaymentConfirmationEmail(recipient, transaction).catch(console.error);

    return sendSuccess(res, { transaction }, 'Transfer completed', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Withdrawal (mock) ────────────────────────────────────
exports.withdraw = async (req, res) => {
  try {
    const { amount, currency = 'USD', bankDetails } = req.body;

    const transaction = await Transaction.create({
      type: 'withdrawal',
      amount,
      currency,
      from: req.user._id,
      status: 'processing',
      description: 'Withdrawal request',
      metadata: { bankDetails: bankDetails || {} },
    });

    // Simulate async processing
    setTimeout(async () => {
      await Transaction.findByIdAndUpdate(transaction._id, { status: 'completed' });
    }, 3000);

    return sendSuccess(res, { transaction }, 'Withdrawal initiated', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Transaction history ──────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const userId = req.user._id;

    const filter = { $or: [{ from: userId }, { to: userId }] };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'from', select: 'firstName lastName avatar' },
        { path: 'to', select: 'firstName lastName avatar' },
      ],
    };

    const result = await Transaction.paginate(filter, options);
    return sendPaginated(res, result.docs, {
      total: result.totalDocs, pages: result.totalPages,
      current: result.page, limit: result.limit,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Summary / wallet balance ─────────────────────────────
exports.getWalletSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    const [inflow, outflow] = await Promise.all([
      Transaction.aggregate([
        { $match: { to: userId, status: 'completed', type: { $in: ['deposit', 'transfer'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { from: userId, status: 'completed', type: { $in: ['withdrawal', 'transfer'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalIn  = inflow[0]?.total  || 0;
    const totalOut = outflow[0]?.total || 0;

    return sendSuccess(res, {
      balance: +(totalIn - totalOut).toFixed(2),
      totalDeposited: totalIn,
      totalWithdrawn: totalOut,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
