import Conversation from "../models/conversation.models.js";
import Message from "../models/message.models.js";
import asynchHandler from "express-async-handler";
import mongoose from "mongoose";
import ApiError from "../utils/apiError.utils.js";
import ApiResponse from "../utils/apiResponse.utils.js";
// for socket
import { onlineUsers } from "../sockets/socket.js";

const getMessages = asynchHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    res.status(400);
    throw new ApiError(400, "Invalid conversation id");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    res.status(404);
    throw new ApiError(404, "Conversation not found");
  }

  const isRequesterMember = conversation.members.some(
    (memberId) => memberId.toString() === userId,
  );

  if (!isRequesterMember) {
    res.status(403);
    throw new ApiError(403, "You are not a member of this conversation");
  }

  const messages = await Message.find({ conversationId }).sort({
    createdAt: 1,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, "Messages fetched successfully", messages));
});

const sendMessage = asynchHandler(async (req, res) => {
  const { conversationId, text } = req.body;
  const senderId = req.user.id;

  if (
    !mongoose.Types.ObjectId.isValid(conversationId) ||
    !mongoose.Types.ObjectId.isValid(senderId)
  ) {
    res.status(400);
    throw new ApiError(400, "Invalid conversation or user id");
  }

  if (!text || text.trim().length === 0) {
    res.status(400);
    throw new ApiError(400, "Message text cannot be empty");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    res.status(404);
    throw new ApiError(404, "Conversation not found");
  }

  const isSenderMember = conversation.members.some(
    (memberId) => memberId.toString() === senderId,
  );

  if (!isSenderMember) {
    res.status(403);
    throw new ApiError(403, "You are not a member of this conversation");
  }

  const receiverId = conversation.members
    .find((memberId) => memberId.toString() !== senderId)
    ?.toString();

  const message = new Message({
    conversationId,
    senderId,
    receiverId,
    text: text.trim(),
  });

  await message.save();

  await Conversation.findByIdAndUpdate(
    conversationId,
    { lastMessage: text.trim() },
    { new: true },
  );

  const io = req.app.get("io");
  const receiverSocketId = receiverId ? onlineUsers.get(receiverId) : null;

  if (io && receiverSocketId) {
    io.to(receiverSocketId).emit("newMessage", {
      message,
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, "Message sent successfully", message));
});

export { getMessages, sendMessage };
