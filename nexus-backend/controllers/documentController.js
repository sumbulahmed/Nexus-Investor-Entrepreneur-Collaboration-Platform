const Document = require('../models/Document');
const User = require('../models/User');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { createNotification } = require('../utils/notificationService');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../middleware/upload');

// ─── Upload document ──────────────────────────────────────
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const { name, description, category, tags } = req.body;

    const doc = await Document.create({
      name: name || req.file.originalname,
      description: description || '',
      category: category || 'other',
      s3Key: req.file.key,
      s3Url: req.file.location,
      mimeType: req.file.contentType || req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname,
      uploadedBy: req.user._id,
      tags: tags ? JSON.parse(tags) : [],
    });

    await doc.populate('uploadedBy', 'firstName lastName avatar');
    return sendSuccess(res, { document: doc }, 'Document uploaded successfully', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get my documents ─────────────────────────────────────
exports.getMyDocuments = async (req, res) => {
  try {
    const { category, status, page = 1, limit = 10, search } = req.query;
    const userId = req.user._id;

    const filter = {
      $or: [{ uploadedBy: userId }, { sharedWith: userId }],
    };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'uploadedBy', select: 'firstName lastName avatar' },
        { path: 'sharedWith', select: 'firstName lastName avatar' },
      ],
    };

    const result = await Document.paginate(filter, options);
    return sendPaginated(res, result.docs, {
      total: result.totalDocs, pages: result.totalPages,
      current: result.page, limit: result.limit,
    });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get single document ──────────────────────────────────
exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy sharedWith', 'firstName lastName avatar email')
      .populate('signatures.signedBy', 'firstName lastName');

    if (!doc) return sendError(res, 'Document not found', 404);

    const canAccess =
      doc.uploadedBy._id.equals(req.user._id) ||
      doc.sharedWith.some((u) => u._id.equals(req.user._id)) ||
      doc.isPublic ||
      req.user.role === 'admin';

    if (!canAccess) return sendError(res, 'Access denied', 403);

    // Record view
    const alreadyViewed = doc.viewedBy.some((v) => v.user?.equals(req.user._id));
    if (!alreadyViewed && !doc.uploadedBy._id.equals(req.user._id)) {
      doc.viewedBy.push({ user: req.user._id, viewedAt: new Date() });
      await doc.save();
    }

    return sendSuccess(res, { document: doc });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Share document ───────────────────────────────────────
exports.shareDocument = async (req, res) => {
  try {
    const { userIds } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return sendError(res, 'Document not found', 404);
    if (!doc.uploadedBy.equals(req.user._id)) return sendError(res, 'Only the owner can share', 403);

    const newIds = userIds.filter((id) => !doc.sharedWith.includes(id));
    doc.sharedWith.push(...newIds);
    await doc.save();

    // Notify new recipients
    for (const uid of newIds) {
      await createNotification({
        recipient: uid,
        type: 'document_shared',
        title: 'Document Shared',
        message: `${req.user.firstName} shared "${doc.name}" with you`,
        data: { documentId: doc._id },
      });
    }

    await doc.populate('uploadedBy sharedWith', 'firstName lastName avatar');
    return sendSuccess(res, { document: doc }, 'Document shared');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Update document status ───────────────────────────────
exports.updateDocumentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'under-review', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) return sendError(res, 'Invalid status', 400);

    const doc = await Document.findById(req.params.id);
    if (!doc) return sendError(res, 'Document not found', 404);

    const canUpdate =
      doc.uploadedBy.equals(req.user._id) ||
      doc.sharedWith.includes(req.user._id) ||
      req.user.role === 'admin';
    if (!canUpdate) return sendError(res, 'Access denied', 403);

    doc.status = status;
    await doc.save();
    return sendSuccess(res, { document: doc }, 'Status updated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Sign document (store signature image) ────────────────
exports.signDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return sendError(res, 'Document not found', 404);

    const canSign =
      doc.uploadedBy.equals(req.user._id) ||
      doc.sharedWith.includes(req.user._id);
    if (!canSign) return sendError(res, 'Access denied', 403);

    const alreadySigned = doc.signatures.some((s) => s.signedBy?.equals(req.user._id));
    if (alreadySigned) return sendError(res, 'Already signed by you', 400);

    if (!req.file) return sendError(res, 'Signature image required', 400);

    doc.signatures.push({
      signedBy: req.user._id,
      signatureUrl: req.file.location,
      signedAt: new Date(),
      ipAddress: req.ip,
    });

    doc.status = 'signed';
    await doc.save();

    // Notify owner
    if (!doc.uploadedBy.equals(req.user._id)) {
      await createNotification({
        recipient: doc.uploadedBy,
        type: 'document_signed',
        title: 'Document Signed',
        message: `${req.user.firstName} signed "${doc.name}"`,
        data: { documentId: doc._id },
      });
    }

    await doc.populate('signatures.signedBy', 'firstName lastName');
    return sendSuccess(res, { document: doc }, 'Document signed');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Upload new version ───────────────────────────────────
exports.uploadNewVersion = async (req, res) => {
  try {
    const parent = await Document.findById(req.params.id);
    if (!parent) return sendError(res, 'Document not found', 404);
    if (!parent.uploadedBy.equals(req.user._id)) return sendError(res, 'Only the owner can upload versions', 403);
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const newVersion = await Document.create({
      name: parent.name,
      description: req.body.description || parent.description,
      category: parent.category,
      s3Key: req.file.key,
      s3Url: req.file.location,
      mimeType: req.file.contentType || req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname,
      uploadedBy: req.user._id,
      sharedWith: parent.sharedWith,
      version: parent.version + 1,
      parentDoc: parent._id,
      tags: parent.tags,
    });

    return sendSuccess(res, { document: newVersion }, 'New version uploaded', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Delete document ──────────────────────────────────────
exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return sendError(res, 'Document not found', 404);
    if (!doc.uploadedBy.equals(req.user._id) && req.user.role !== 'admin') {
      return sendError(res, 'Access denied', 403);
    }

    // Delete from S3
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: doc.s3Key,
    })).catch(console.error);

    await doc.deleteOne();
    return sendSuccess(res, {}, 'Document deleted');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
