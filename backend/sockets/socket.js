import { clearGlobalRateLimitForUser, registerGlobalChatEvents } from "./globalChat.js";
import { authenticateSocket } from "./socketAuth.js";

export const onlineUsers = new Map();

const emitOnlineCount = (io) => {
	io.emit("online_count", {
		count: onlineUsers.size,
	});
};

const removeUserBySocketId = (socketId) => {
	for (const [userId, userSocketId] of onlineUsers.entries()) {
		if (userSocketId === socketId) {
			onlineUsers.delete(userId);
			return userId;
		}
	}

	return null;
};

export const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

	io.on("connection", (socket) => {
		console.log("User connected:", socket.id);
		const authenticatedUserId = socket.data.userId;

		if (authenticatedUserId) {
			onlineUsers.set(authenticatedUserId, socket.id);
		}

		emitOnlineCount(io);

		registerGlobalChatEvents(io, socket);

		socket.on("join", (userId) => {
			if (!userId || !authenticatedUserId) {
				console.error("User ID is required to join");
				return;
			}

			if (String(userId) !== String(authenticatedUserId)) {
				socket.emit("rate_limit_error", {
					message: "User identity mismatch",
				});
				return;
			}

			onlineUsers.set(authenticatedUserId, socket.id);
			emitOnlineCount(io);
			console.log("Online users:", Object.fromEntries(onlineUsers));
		});

		socket.on("disconnect", () => {
			const disconnectedUserId = removeUserBySocketId(socket.id);
			clearGlobalRateLimitForUser(disconnectedUserId);
			emitOnlineCount(io);
			console.log("User disconnected:", socket.id);
		});
	});
};