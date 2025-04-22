import express from 'express';
import { suggestCopiers } from '../controllers/aiController.js';

const router = express.Router();

router.post('/suggest-copiers', suggestCopiers);

export default router;
