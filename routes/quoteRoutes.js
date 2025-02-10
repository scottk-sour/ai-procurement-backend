import express from 'express';
import { requestQuotes, getUserQuotes, getPendingQuotes } from '../controllers/quoteController.js';

const router = express.Router();

router.post('/request', requestQuotes);
router.get('/user', getUserQuotes);
router.get('/pending', getPendingQuotes);

export default router;
