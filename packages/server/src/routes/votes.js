import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { votePost } from '../controllers/voteController.js';

const router = express.Router();

router.post('/', authMiddleware, votePost);

export default router;