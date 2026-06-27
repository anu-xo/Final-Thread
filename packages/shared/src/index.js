// Socket event name constants — used by both server and web
const SOCKET_EVENTS = {
  VOTE_UPDATED: 'vote:updated',
  NOTIFICATION_NEW: 'notification:new',
  POST_CREATED: 'post:created',
  COMMENT_CREATED: 'comment:created',
  AI_STREAM_CHUNK: 'ai:stream:chunk',
  AI_STREAM_END: 'ai:stream:end',
  USER_JOINED_ROOM: 'user:joined:room',
}

// API response envelope helper
const createResponse = (data, meta = null, error = null) => ({
  data,
  error,
  meta,
})

module.exports = { SOCKET_EVENTS, createResponse }