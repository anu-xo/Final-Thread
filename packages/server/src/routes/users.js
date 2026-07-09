// packages/server/src/routes/users.js
router.get('/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .select('username avatar bio karma createdAt')
    .lean();

  if (!user) {
    return res.status(404).json({ data: null, error: 'User not found', meta: null });
  }

  // Karma = sum of scores across their posts + comments.
  // Computed on read (not stored) to avoid drift from vote changes.
  const [postKarma, commentKarma] = await Promise.all([
    Post.aggregate([
      { $match: { author: user._id, isRemoved: false } },
      { $group: { _id: null, total: { $sum: '$score' } } }
    ]),
    Comment.aggregate([
      { $match: { author: user._id, isRemoved: false } },
      { $group: { _id: null, total: { $sum: '$score' } } }
    ])
  ]);

  res.json({
    data: {
      ...user,
      karma: (postKarma[0]?.total || 0) + (commentKarma[0]?.total || 0)
    },
    error: null,
    meta: null
  });
});

router.put('/me', authMiddleware, async (req, res) => {
  const { bio, avatar, notifPrefs } = req.body;
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { bio, avatar, notifPrefs } },
    { new: true, runValidators: true }
  ).select('-passwordHash -refreshTokens');

  res.json({ data: updated, error: null, meta: null });
});