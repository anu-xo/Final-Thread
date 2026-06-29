import Bull from 'bull';

const url = new URL(process.env.REDIS_URL);

let embeddingQueue;

export const getEmbeddingQueue = () => {
  if (!embeddingQueue) {
    embeddingQueue = new Bull('embedding', {
      redis: {
        host: url.hostname,
        port: Number(url.port),
        password: decodeURIComponent(url.password),
        tls: {},
      },
    });
  }
  return embeddingQueue;
};