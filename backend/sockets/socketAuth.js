import jwt from "jsonwebtoken";
import env from "../config/env.js";

const parseCookies = (cookieHeader = "") => {
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        return acc;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(entry.slice(separatorIndex + 1).trim());

      if (key) {
        acc[key] = value;
      }

      return acc;
    }, {});
};

export const authenticateSocket = (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers?.cookie || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies.accessToken;

    if (!token) {
      return next(new Error("Unauthorized: missing access token"));
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    socket.data.userId = String(decoded.id);

    return next();
  } catch (error) {
    return next(new Error("Unauthorized: invalid access token"));
  }
};
