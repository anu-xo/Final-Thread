// src/lib/socket.js
import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
  withCredentials: true,
  transports: ['websocket'],
  autoConnect: true,
});