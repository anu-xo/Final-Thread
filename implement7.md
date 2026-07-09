7.3 GET /search?q=&type= — Atlas Search
This needs an Atlas Search index (separate from your Day 4 Vector Search index) on Post, Community, and User collections — a text index, not a vector one.
Index setup (Atlas UI or via mongosh), one per collection, e.g. for posts:
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": { "type": "string" },
      "body": { "type": "string" }
    }
  }
}
router.get('/', authMiddleware, async (req, res) => {
  const { q, type = 'all', limit = 10 } = req.query;
  if (!q || q.trim().length < 2) {
    return res.json({ data: { posts: [], communities: [], users: [] }, error: null, meta: null });
  }

  const searchStage = (indexName, path) => ([
    {
      $search: {
        index: indexName,
        text: { query: q, path }
      }
    },
    { $limit: Number(limit) }
  ]);

  const results = { posts: [], communities: [], users: [] };

  if (type === 'all' || type === 'posts') {
    results.posts = await Post.aggregate(searchStage('default', ['title', 'body']));
  }
  if (type === 'all' || type === 'communities') {
    results.communities = await Community.aggregate(searchStage('default', ['name', 'description']));
  }
  if (type === 'all' || type === 'users') {
    results.users = await User.aggregate(searchStage('default', ['username']));
  }

  res.json({ data: results, error: null, meta: null });
});
Reasoning on running three separate $search aggregations instead of one: Atlas Search doesn't let you $search across multiple collections in a single aggregation pipeline — each $search stage is bound to the collection it's run against. So a "search everything" experience is necessarily 1–3 parallel queries (fired with Promise.all in production, shown sequentially above for clarity) rather than one big query. This is a real MongoDB constraint, not a design choice you can optimize away.