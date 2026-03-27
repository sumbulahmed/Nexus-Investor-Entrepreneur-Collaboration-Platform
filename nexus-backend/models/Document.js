const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const documentSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, maxlength: 1000, default: '' },
    category:    {
      type: String,
      enum: ['pitch-deck', 'term-sheet', 'nda', 'financial', 'legal', 'other'],
      default: 'other',
    },

    // Storage
    s3Key:       { type: String, required: true },
    s3Url:       { type: String, required: true },
    mimeType:    { type: String, required: true },
    size:        { type: Number, required: true },        // bytes
    originalName:{ type: String, required: true },

    // Ownership
    uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sharedWith:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Versioning
    version:     { type: Number, default: 1 },
    parentDoc:   { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },

    // Workflow status
    status: {
      type: String,
      enum: ['draft', 'under-review', 'approved', 'rejected', 'signed'],
      default: 'draft',
    },

    // E-signature
    signatures: [
      {
        signedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        signatureUrl:{ type: String },    // S3 URL to signature image
        signedAt:    { type: Date },
        ipAddress:   { type: String },
      },
    ],

    // Audit
    viewedBy: [
      {
        user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date },
      },
    ],

    isPublic: { type: Boolean, default: false },
    tags:     [{ type: String }],
  },
  { timestamps: true }
);

documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ sharedWith: 1 });
documentSchema.index({ status: 1 });
documentSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Document', documentSchema);
