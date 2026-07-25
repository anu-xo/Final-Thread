const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ThreadVerse API',
      version: '1.0.0',
      description: 'Reddit-style community platform with AI-powered Q&A, real-time voting, and semantic search.',
      contact: { name: 'ThreadVerse' },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local development' },
      { url: 'https://api.threadverse.app', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
        },
      },
      schemas: {
        Envelope: {
          type: 'object',
          properties: {
            data: { description: 'Response payload (null on error)' },
            error: { type: 'string', nullable: true, description: 'Error message (null on success)' },
            meta: {
              type: 'object',
              nullable: true,
              properties: {
                cursor: { type: 'string', nullable: true },
                hasMore: { type: 'boolean' },
                total: { type: 'number', nullable: true },
              },
            },
          },
          required: ['data', 'error', 'meta'],
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['user', 'moderator', 'admin'] },
            karma: { type: 'integer' },
            isBanned: { type: 'boolean' },
            banReason: { type: 'string', nullable: true },
            theme: { type: 'string', enum: ['light', 'dark', 'system'] },
            notifPrefs: {
              type: 'object',
              properties: {
                digest: { type: 'boolean' },
                replies: { type: 'boolean' },
                mentions: { type: 'boolean' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        UserPublic: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['user', 'moderator', 'admin'] },
            karma: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Post: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string', maxLength: 300 },
            body: { type: 'string' },
            content: { type: 'string' },
            author: { $ref: '#/components/schemas/UserPublic' },
            community: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/CommunitySummary' }] },
            type: { type: 'string', enum: ['text', 'link', 'image'] },
            url: { type: 'string', nullable: true },
            media: { type: 'array', items: { type: 'string' } },
            flair: { type: 'string', nullable: true },
            upvotes: { type: 'integer' },
            downvotes: { type: 'integer' },
            score: { type: 'integer' },
            hotScore: { type: 'number' },
            risingScore: { type: 'number' },
            commentCount: { type: 'integer' },
            isPinned: { type: 'boolean' },
            userVote: { type: 'integer', enum: [-1, 0, 1], description: 'Included when viewer is authenticated' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PostInput: {
          type: 'object',
          required: ['title', 'community'],
          properties: {
            title: { type: 'string', maxLength: 300 },
            body: { type: 'string', description: 'Markdown body for text posts' },
            content: { type: 'string', description: 'Alias for body' },
            community: { type: 'string', description: 'Community ID or slug' },
            type: { type: 'string', enum: ['text', 'link', 'image'], default: 'text' },
            url: { type: 'string', description: 'Required for link posts' },
            media: { type: 'array', items: { type: 'string' }, description: 'Cloudinary URLs for image posts' },
            flair: { type: 'string' },
          },
        },
        PostList: {
          type: 'object',
          properties: {
            posts: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
            nextCursor: { type: 'string', nullable: true },
            hasMore: { type: 'boolean' },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            body: { type: 'string' },
            author: { $ref: '#/components/schemas/UserPublic' },
            post: { type: 'string' },
            parent: { type: 'string', nullable: true },
            depth: { type: 'integer', maximum: 5 },
            score: { type: 'integer' },
            userVote: { type: 'integer', enum: [-1, 0, 1] },
            children: {
              type: 'array',
              description: 'Nested child comments',
              items: { $ref: '#/components/schemas/Comment' },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CommentInput: {
          type: 'object',
          required: ['body'],
          properties: {
            body: { type: 'string' },
            parentId: { type: 'string', description: 'Parent comment ID for replies' },
          },
        },
        Community: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', maxLength: 100 },
            slug: { type: 'string' },
            description: { type: 'string', maxLength: 500 },
            icon: { type: 'string', nullable: true },
            banner: { type: 'string', nullable: true },
            members: { type: 'integer' },
            mods: { type: 'array', items: { $ref: '#/components/schemas/UserPublic' } },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
            aiEnabled: { type: 'boolean' },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CommunitySummary: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        CommunityInput: {
          type: 'object',
          required: ['name', 'slug'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            slug: { type: 'string' },
            description: { type: 'string', maxLength: 500 },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
          },
        },
        VoteInput: {
          type: 'object',
          required: ['targetId', 'targetType', 'value'],
          properties: {
            targetId: { type: 'string', description: 'Post or comment ID' },
            targetType: { type: 'string', enum: ['post', 'comment'] },
            value: { type: 'integer', enum: [-1, 0, 1] },
          },
        },
        VoteResponse: {
          type: 'object',
          properties: {
            score: { type: 'integer' },
            userVote: { type: 'integer', enum: [-1, 0, 1] },
            hotScore: { type: 'number', description: 'Only for post votes' },
          },
        },
        AIMessage: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            conversation: { type: 'string' },
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  postId: { type: 'string' },
                  title: { type: 'string' },
                },
              },
            },
            tokensUsed: { type: 'integer' },
            rating: { type: 'integer', enum: [-1, 0, 1], nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            user: { type: 'string' },
            type: { type: 'string', enum: ['reply', 'mention', 'upvote', 'comment', 'follow', 'moderation'] },
            actor: { type: 'object', properties: { username: { type: 'string' }, avatar: { type: 'string' } } },
            target: { type: 'string' },
            targetType: { type: 'string', enum: ['Post', 'Comment', 'User'] },
            read: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Report: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            reporter: { $ref: '#/components/schemas/UserPublic' },
            target: { type: 'string' },
            targetType: { type: 'string', enum: ['post', 'comment'] },
            reason: { type: 'string' },
            detail: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending', 'approved', 'removed', 'dismissed'] },
            community: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            data: { type: 'object', nullable: true },
            error: { type: 'string' },
            meta: { type: 'object', nullable: true },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Registration, login, token management' },
      { name: 'Posts', description: 'Create, list, and interact with posts' },
      { name: 'Comments', description: 'Nested comment trees on posts' },
      { name: 'Votes', description: 'Upvote / downvote posts and comments' },
      { name: 'Communities', description: 'Community CRUD, join/leave' },
      { name: 'AI', description: 'AI-powered Q&A chat (RAG + Gemini)' },
      { name: 'Users', description: 'User profiles and preferences' },
      { name: 'Notifications', description: 'User notification feed' },
      { name: 'Search', description: 'Full-text search across content' },
      { name: 'Moderation', description: 'Report review and mod actions' },
      { name: 'Admin', description: 'Admin-only stats, analytics, and user management' },
      { name: 'Desktop', description: 'Electron desktop app version check' },
      { name: 'Feed', description: 'Personalized feed from subscribed communities' },
      { name: 'Upload', description: 'Cloudinary upload signatures' },
    ],
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
  ],
};

export default swaggerOptions;
