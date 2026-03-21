import User from "../models/user.models.js";
import Conversation from "../models/conversation.models.js";
import asynchHandler from "express-async-handler";
import mongoose from "mongoose";
import ApiError from "../utils/apiError.utils.js";
import ApiResponse from "../utils/apiResponse.utils.js";

const createConversation = asynchHandler(async (req, res) => {
  const { receiverId } = req.body;
  const senderId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
    res.status(400);
    throw new ApiError(400, "Invalid user id");
  }

  if (senderId === receiverId) {
    res.status(400);
    throw new ApiError(400, "Cannot create conversation with yourself");
  }

  const receiver = await User.findById(receiverId);
  if (!receiver) {
    res.status(404);
    throw new ApiError(404, "Receiver not found");
  }

  const members = [senderId, receiverId].sort();

  let conversation = await Conversation.findOne({
    "members.0": members[0],
    "members.1": members[1],
  });
  if (conversation) {
    return res
      .status(200)
      .json(
        new ApiResponse(200, "Conversation already exists", conversation),
      );
  }

  try {
    conversation = await Conversation.create({ members });
  } catch (error) {
    if (error?.code === 11000) {
      conversation = await Conversation.findOne({
        "members.0": members[0],
        "members.1": members[1],
      });

      if (!conversation) {
        res.status(409);
        throw new ApiError(
          409,
          "Duplicate key conflict while creating conversation. Check for legacy unique indexes on members.",
        );
      }

      return res
        .status(200)
        .json(
          new ApiResponse(200, "Conversation already exists", conversation),
        );
    }

    throw error;
  }

  return res
    .status(201)
    .json(
      new ApiResponse(201, "Conversation created successfully", conversation),
    );
});

const getUserConversations = asynchHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(401);
    throw new ApiError(401, "Invalid authentication context");
  }

  const conversations = await Conversation.find({ members: userId }).sort({
    updatedAt: -1,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, "Conversations fetched successfully", conversations),
    );
});

export { createConversation, getUserConversations };