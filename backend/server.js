import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import conversationRoutes from "./routes/conversation.route.js";
import messageRoutes from "./routes/message.route.js";
//for socket
import { onlineUsers } from "./sockets/socket.js";
import { Server } from "socket.io";
import http from "http";

dotenv.config();

connectDB(); //db connection

const app = express();
const defaultClientOrigins = ["http://localhost:5173", "http://localhost:3000"];
const clientOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : defaultClientOrigins;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
});

app.set("io", io); // IMPORTANT (for controllers later)

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // user joins
  socket.on("join", (userId) => {
    if (!userId) {
      console.error("User ID is required to join");
      return;
    }
    onlineUsers.set(userId, socket.id);
    console.log("Online users:", Object.fromEntries(onlineUsers));
  });

  // disconnect
  socket.on("disconnect", () => {
    for (let [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

// middleware
app.use(express.json());
app.use(cors({ credentials: true, origin: process.env.CLIENT_URL }));
app.use(cookieParser());

// test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);

app.use("/api/conversations", conversationRoutes);

app.use("/api/messages", messageRoutes);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});