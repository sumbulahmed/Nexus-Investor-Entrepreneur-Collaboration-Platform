const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'transfer', 'investment', 'fee'],
      required: true,
    },
    amount:   { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true },

    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },

    // Stripe references
    stripePaymentIntentId: { type: String, default: '' },
    stripeChargeId:        { type: String, default: '' },
    stripeCustomerId:      { type: String, default: '' },

    description: { type: String, default: '' },
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },

    // Investment specific
    investmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
    equity:       { type: Number, default: 0 },   // percentage

    failureReason: { type: String, default: '' },
    refundedAt:    { type: Date },
  },
  { timestamps: true }
);

transactionSchema.index({ from: 1, createdAt: -1 });
transactionSchema.index({ to: 1, createdAt: -1 });
transactionSchema.index({ stripePaymentIntentId: 1 });
transactionSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Transaction', transactionSchema);
