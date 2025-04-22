import express from 'express';
import multer from 'multer';
import {
  submitCopierQuoteRequest,
  getUserCopierQuotes
} from '../controllers/copierQuoteController.js';

const router = express.Router();

// File upload setup for invoice PDFs
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/users/');
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    cb(null, `invoice-${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ storage });

router.post(
  '/submit',
  upload.array('invoices', 5), // allows multiple invoice uploads
  submitCopierQuoteRequest
);

router.get('/user', getUserCopierQuotes);

export default router;
