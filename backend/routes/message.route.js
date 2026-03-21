import protect from "../middlewares/protect.middleware.js";
import express from "express";
import { getMessages, sendMessage } from "../controllers/message.controller.js";

const router = express.Router();

router.get("/:conversationId", protect, getMessages);
router.post("/", protect, sendMessage);

export default router;