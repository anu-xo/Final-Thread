// routes/postRoutes.js

import express from "express";
import { createPost, getPosts, getPostById } from "../controllers/postController.js";
import { votePost } from "../controllers/voteController.js";
import { authMiddleware } from "../middleware/auth.js";
import commentsRouter from './comments.js';

router.use('/', commentsRouter);

const router = express.Router();

router.post("/", authMiddleware, createPost);
router.get("/", getPosts); // public — no auth required to browse
router.get("/:id", getPostById); // public
router.post("/:id/vote", authMiddleware, votePost);

export default router;