import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  vus: 300,
  duration: '2m',
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // simulate personal room join via auth handshake — adapt to your socket auth
    });

    socket.on('message', (msg) => {
      check(msg, { 'received notification event': (m) => m.includes('notification:new') });
    });

    socket.setTimeout(() => socket.close(), 30000);
  });

  check(res, { 'connected successfully': (r) => r && r.status === 101 });
  sleep(1);
}