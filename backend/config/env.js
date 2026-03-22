import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
}

const normalizeOrigin = (origin) => origin.trim().replace(/\/$/, "");

const parseAllowedOrigins = () => {
  const rawOrigins = process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:5173";

  return rawOrigins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
};

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: process.env.JWT_EXPIRATION || "15m",
  allowedOrigins: parseAllowedOrigins(),
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProduction,
  cookieSameSite: process.env.COOKIE_SAME_SITE || (isProduction ? "none" : "lax"),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : (isProduction ? 1 : 0),
  globalMessageCooldownMs: Number(process.env.GLOBAL_MESSAGE_COOLDOWN_MS || 10000),
  globalHistoryLimit: Number(process.env.GLOBAL_HISTORY_LIMIT || 30),
};

export default env;
