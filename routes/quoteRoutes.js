import express from 'express';
import multer from 'multer';
import { requestQuotes, getUserQuotes, getPendingQuotes } from '../controllers/quoteController.js';

const router = express.Router();
const upload = multer(); // Using default memory storage; configure if needed

// Use multer middleware to handle multipart/form-data for quote requests.
router.post('/request', upload.any(), requestQuotes);

router.get('/user', getUserQuotes);
router.get('/pending', getPendingQuotes);

export default router;
