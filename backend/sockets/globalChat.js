import GlobalMessage from "../models/globalMessage.models.js";
import env from "../config/env.js";

const globalMessageCooldown = new Map();

const GLOBAL_ROOM = "global";
const GLOBAL_MESSAGE_COOLDOWN_MS = env.globalMessageCooldownMs;

export const clearGlobalRateLimitForUser = (userId) => {
  if (!userId) {
    return;
  }

  globalMessageCooldown.delete(userId);
};

const isRateLimited = (userId) => {
  const now = Date.now();
  const lastMessageTimestamp = globalMessageCooldown.get(userId);

  if (lastMessageTimestamp && now - lastMessageTimestamp < GLOBAL_MESSAGE_COOLDOWN_MS) {
    const retryAfterMs = GLOBAL_MESSAGE_COOLDOWN_MS - (now - lastMessageTimestamp);
    return {
      limited: true,
      retryAfterMs,
    };
  }

  globalMessageCooldown.set(userId, now);
  return {
    limited: false,
    retryAfterMs: 0,
  };
};

export const registerGlobalChatEvents = (io, socket) => {
  // Every connected socket is part of the global room.
  socket.join(GLOBAL_ROOM);

  const sendGlobalHistory = async () => {
    try {
      const history = await GlobalMessage.find({})
        .sort({ createdAt: -1 })
        .limit(env.globalHistoryLimit)
        .lean();

      socket.emit(
        "global_history",
        history
          .reverse()
          .map((item) => ({
            _id: item._id,
            text: item.text,
            createdAt: item.createdAt,
          })),
      );
    } catch (error) {
      console.error("Error loading global message history:", error);
    }
  };

  sendGlobalHistory();

  socket.on("send_global_message", async (payload = {}) => {
    const { text } = payload;
    const userId = socket.data?.userId;

    if (!userId) {
      socket.emit("rate_limit_error", {
        message: "Join is required before sending global messages",
      });
      return;
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      socket.emit("rate_limit_error", {
        message: "Invalid global message payload",
      });
      return;
    }

    const { limited, retryAfterMs } = isRateLimited(userId);

    if (limited) {
      socket.emit("rate_limit_error", {
        message: "You can only send one message every 10 seconds",
        retryAfterMs,
      });
      return;
    }

    const outgoingMessage = {
      text: text.trim(),
    };

    try {
      const savedMessage = await GlobalMessage.create({
        userId,
        text: outgoingMessage.text,
      });

      io.to(GLOBAL_ROOM).emit("receive_global_message", {
        text: outgoingMessage.text,
        _id: savedMessage._id,
        createdAt: savedMessage.createdAt,
      });
    } catch (error) {
      console.error("Error saving global message:", error);
      io.to(GLOBAL_ROOM).emit("receive_global_message", outgoingMessage);
    }
  });
};
