const User = require('../models/User');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../middleware/upload');

// ─── Get all users (admin or discovery) ───────────────────
exports.getUsers = async (req, res) => {
  try {
    const { role, industry, stage, page = 1, limit = 12, search } = req.query;
    const filter = { isActive: true };

    if (role) filter.role = role;
    if (industry) filter.industry = industry;
    if (stage) filter.startupStage = stage;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
        { startupName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } },
      ];
    }

    // Non-admins only see approved, public profiles
    if (req.user.role !== 'admin') {
      filter.isEmailVerified = true;
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      select: '-password -emailVerifyToken -passwordResetToken -refreshTokens -twoFactorSecret',
    };

    const result = await User.paginate(filter, options);

    return sendPaginated(
      res,
      result.docs,
      {
        total: result.totalDocs,
        pages: result.totalPages,
        current: result.page,
        limit: result.limit,
      }
    );
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get single user ──────────────────────────────────────
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerifyToken -passwordResetToken -refreshTokens -twoFactorSecret');
    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, { user });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Update profile ───────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const allowed = [
      'firstName', 'lastName', 'bio', 'phone', 'location', 'website', 'linkedIn',
      'startupName', 'startupStage', 'industry', 'fundingNeeded',
      'investmentRange', 'preferredStages', 'preferredIndustries',
    ];

    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, { user: user.toPublicJSON() }, 'Profile updated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Upload avatar ────────────────────────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const oldAvatar = req.user.avatar;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: req.file.location },
      { new: true }
    );

    // Delete old avatar from S3
    if (oldAvatar && oldAvatar.includes('amazonaws.com')) {
      const key = oldAvatar.split('.com/')[1];
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
      })).catch(console.error);
    }

    return sendSuccess(res, { avatar: user.avatar }, 'Avatar updated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Change password ──────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return sendError(res, 'Current password is incorrect', 401);
    }
    user.password = req.body.newPassword;
    await user.save();
    return sendSuccess(res, {}, 'Password updated successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Deactivate account ───────────────────────────────────
exports.deactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.password))) {
      return sendError(res, 'Password is incorrect', 401);
    }
    user.isActive = false;
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, {}, 'Account deactivated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Admin: delete user ───────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, {}, 'User deleted');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Dashboard stats ──────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const Meeting = require('../models/Meeting');
    const Document = require('../models/Document');
    const Transaction = require('../models/Transaction');

    const [upcomingMeetings, pendingMeetings, myDocs, recentTxns] = await Promise.all([
      Meeting.countDocuments({
        $or: [{ organizer: userId }, { attendees: userId }],
        status: 'accepted',
        startTime: { $gte: new Date() },
      }),
      Meeting.countDocuments({
        attendees: userId,
        status: 'pending',
      }),
      Document.countDocuments({ uploadedBy: userId }),
      Transaction.find({
        $or: [{ from: userId }, { to: userId }],
        status: 'completed',
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('from to', 'firstName lastName'),
    ]);

    return sendSuccess(res, {
      upcomingMeetings,
      pendingMeetings,
      documentsUploaded: myDocs,
      recentTransactions: recentTxns,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
