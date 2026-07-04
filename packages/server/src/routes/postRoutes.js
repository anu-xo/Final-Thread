// routes/postRoutes.js

import express from "express";
import { createPost, getPosts, getPostById } from "../controllers/postController.js";
import { votePost } from "../controllers/voteController.js";
import { requireAuth } from "../middleware/authMiddleware.js"; // adjust to your existing middleware name

const router = express.Router();

router.post("/posts", requireAuth, createPost);
router.get("/posts", getPosts); // public — no auth required to browse
router.get("/posts/:id", getPostById); // public
router.post("/posts/:id/vote", requireAuth, votePost);

export default router;