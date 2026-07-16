let io = null;

export function setIO(instance) {
  io = instance;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io instance not initialized — call setIO() first');
  }
  return io;
}
