import {createConversation, getUserConversations} from '../controllers/conversation.controller.js';
import express from 'express';
import protect from '../middlewares/protect.middleware.js';

const router = express.Router();

router.post('/', protect,  createConversation);
router.get('/me', protect, getUserConversations);

export default router;