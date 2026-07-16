let ioInstance = null;

export function initIO(io) {
  ioInstance = io;
  return io;
}

export function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized yet');
  }
  return ioInstance;
}
