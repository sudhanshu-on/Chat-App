import { getUsers, signin, signup } from "../controllers/auth.controller.js";
import express from "express";
import protect from "../middlewares/protect.middleware.js";

const router = express.Router();

router.post("/signin", signin);
router.post("/signup", signup);
router.get("/users", protect, getUsers);

export default router;