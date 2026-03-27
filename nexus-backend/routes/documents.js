const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentController');
const { protect } = require('../middleware/auth');
const { documentUpload, signatureUpload } = require('../middleware/upload');

router.use(protect);

router.get('/', ctrl.getMyDocuments);
router.post('/', documentUpload.single('document'), ctrl.uploadDocument);
router.get('/:id', ctrl.getDocument);
router.post('/:id/share', ctrl.shareDocument);
router.patch('/:id/status', ctrl.updateDocumentStatus);
router.post('/:id/sign', signatureUpload.single('signature'), ctrl.signDocument);
router.post('/:id/version', documentUpload.single('document'), ctrl.uploadNewVersion);
router.delete('/:id', ctrl.deleteDocument);

module.exports = router;
