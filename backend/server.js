import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import connectDB from "./config/db.js";
import env from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import conversationRoutes from "./routes/conversation.route.js";
import messageRoutes from "./routes/message.route.js";
//for socket
import { setupSocketHandlers } from "./sockets/socket.js";
import { Server } from "socket.io";
import http from "http";

connectDB(); //db connection

const app = express();

if (env.trustProxy > 0) {
  app.set("trust proxy", env.trustProxy);
}

const server = http.createServer(app);

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProduction ? 300 : 1500,
  standardHeaders: true,
  legacyHeaders: false,
});

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return env.allowedOrigins.includes(origin.replace(/\/$/, ""));
};

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
};

const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io); // IMPORTANT (for controllers later)

setupSocketHandlers(io);

// middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use("/api", apiRateLimiter);

// test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);

app.use("/api/conversations", conversationRoutes);

app.use("/api/messages", messageRoutes);

const PORT = env.port;

server.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});