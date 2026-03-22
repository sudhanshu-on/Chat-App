import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/user.models.js";
import asyncHandler from "express-async-handler";
import ApiResponse from "../utils/apiResponse.utils.js";
import ApiError from "../utils/apiError.utils.js";
import env from "../config/env.js";

const setCookies = (res, token) => {
  res.cookie("accessToken", token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
};



const signin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  const passwordIsValid = await bcrypt.compare(password, user.password);
  if (!passwordIsValid) {
    throw new ApiError(401, "Invalid password");
  }
  const token = jwt.sign({ id: user._id }, env.jwtSecret, {
    expiresIn: env.jwtExpiration,
  });
  setCookies(res, token);
  return res.status(200).json(
    new ApiResponse(200, "User signed in successfully", {
      id: user._id,
      username: user.username,
      email: user.email,
    }),
  );
});

const signup = asyncHandler(async (req, res) => {
  const {name, username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    username,
    email,
    password: hashedPassword,
  });
  const token = jwt.sign({ id: user._id }, env.jwtSecret, {
    expiresIn: env.jwtExpiration,
  });
  setCookies(res, token);
  return res.status(200).json(
    new ApiResponse(200, "User registered successfully", {
      id: user._id,
      username: user.username,
      email: user.email,
    }),
  );
});

const getUsers = asyncHandler(async (req, res) => {
  const currentUserId = req.user?.id;

  const users = await User.find(
    currentUserId ? { _id: { $ne: currentUserId } } : {},
  ).select("_id name username email profilePic isOnline");

  return res
    .status(200)
    .json(new ApiResponse(200, "Users fetched successfully", users));
});

export { getUsers, signin, signup };
