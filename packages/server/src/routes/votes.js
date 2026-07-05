// after successfully saving the vote and recalculating score
const io = req.app.get('io'); // see note below on how io gets attached
io.to(`post:${postId}`).emit('vote:updated', {
  postId,
  newScore
});