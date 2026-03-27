const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const mongoosePaginate = require('mongoose-paginate-v2');

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required: [firstName, lastName, email, password, role]
 *       properties:
 *         _id:       { type: string }
 *         firstName: { type: string }
 *         lastName:  { type: string }
 *         email:     { type: string, format: email }
 *         role:      { type: string, enum: [investor, entrepreneur, admin] }
 *         avatar:    { type: string }
 *         bio:       { type: string }
 *         isEmailVerified: { type: boolean }
 *         twoFactorEnabled: { type: boolean }
 */
const userSchema = new mongoose.Schema(
  {
    firstName:  { type: String, required: true, trim: true, maxlength: 50 },
    lastName:   { type: String, required: true, trim: true, maxlength: 50 },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:   { type: String, required: true, minlength: 8, select: false },
    role:       { type: String, enum: ['investor', 'entrepreneur', 'admin'], default: 'entrepreneur' },

    // Profile fields
    avatar:     { type: String, default: '' },
    bio:        { type: String, maxlength: 1000, default: '' },
    phone:      { type: String, default: '' },
    location:   { type: String, default: '' },
    website:    { type: String, default: '' },
    linkedIn:   { type: String, default: '' },

    // Entrepreneur-specific
    startupName:    { type: String, default: '' },
    startupStage:   { type: String, enum: ['idea', 'mvp', 'seed', 'seriesA', 'growth', ''], default: '' },
    industry:       { type: String, default: '' },
    fundingNeeded:  { type: Number, default: 0 },
    pitchDeck:      { type: String, default: '' },  // S3 URL

    // Investor-specific
    investmentRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    portfolioSize:  { type: Number, default: 0 },
    preferredStages: [{ type: String }],
    preferredIndustries: [{ type: String }],

    // Auth / security
    isEmailVerified:   { type: Boolean, default: false },
    emailVerifyToken:  { type: String, select: false },
    emailVerifyExpiry: { type: Date, select: false },

    passwordResetToken:  { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },

    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret:  { type: String, select: false },

    refreshTokens: [{ type: String, select: false }],

    // Status
    isActive:  { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ industry: 1 });

// ─── Pre-save: hash password ──────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Instance methods ─────────────────────────────────────
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.emailVerifyExpiry;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpiry;
  delete obj.twoFactorSecret;
  delete obj.refreshTokens;
  return obj;
};

userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('User', userSchema);
