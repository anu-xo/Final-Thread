// routes/postRoutes.js

import express from "express";
import { createPost, getPosts, getPostById } from "../controllers/postController.js";
import { votePost } from "../controllers/voteController.js";
import { authMiddleware } from "../middleware/auth.js";
import commentsRouter from './comments.js';

const router = express.Router();

router.use('/', commentsRouter);

/**
 * @openapi
 * /posts:
 *   post:
 *     tags: [Posts]
 *     summary: Create a new post
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PostInput'
 *     responses:
 *       201:
 *         description: Post created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         post:
 *                           $ref: '#/components/schemas/Post'
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Community not found
 *       422:
 *         description: Content flagged by moderation
 */
router.post("/", authMiddleware, createPost);

/**
 * @openapi
 * /posts:
 *   get:
 *     tags: [Posts]
 *     summary: List posts with pagination and sorting
 *     parameters:
 *       - in: query
 *         name: community
 *         schema:
 *           type: string
 *         description: Filter by community ID or slug
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [new, top, hot, rising]
 *           default: new
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for next page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only posts created after this ISO date
 *     responses:
 *       200:
 *         description: Paginated list of posts
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PostList'
 */
router.get("/", getPosts);

/**
 * @openapi
 * /posts/{id}:
 *   get:
 *     tags: [Posts]
 *     summary: Get a single post by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         post:
 *                           $ref: '#/components/schemas/Post'
 *       400:
 *         description: Invalid post ID
 *       404:
 *         description: Post not found
 */
router.get("/:id", getPostById);

/**
 * @openapi
 * /posts/{id}/vote:
 *   post:
 *     tags: [Posts, Votes]
 *     summary: Vote on a post (upvote/downvote)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value:
 *                 type: integer
 *                 enum: [1, -1]
 *               direction:
 *                 type: integer
 *                 enum: [1, -1]
 *                 description: Alias for value
 *     responses:
 *       200:
 *         description: Vote recorded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/VoteResponse'
 *       400:
 *         description: Invalid vote value or post ID
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Post not found
 */
router.post("/:id/vote", authMiddleware, votePost);

export default router;
