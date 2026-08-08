import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'LoadTestPass123!';
const USER_COUNT = 15;

const aiChatDuration = new Trend('ai_chat_duration');
const aiChatTokens = new Trend('ai_chat_tokens');
const aiHealthDuration = new Trend('ai_health_duration');
const healthCheckDuration = new Trend('health_check_duration');
const healthDbStatus = new Rate('health_db_connected');
const healthRedisStatus = new Rate('health_redis_connected');

export const options = {
  scenarios: {
    web_users: {
      executor: 'ramping-vus',
      startTime: '30s',
      tags: { type: 'web' },
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      exec: 'webUser',
    },
    desktop_clients: {
      executor: 'ramping-vus',
      startTime: '30s',
      tags: { type: 'desktop' },
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      exec: 'desktopClient',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{type:web}': ['p(95)<2000'],
    'http_req_duration{type:desktop}': ['p(95)<2000'],
    'http_req_failed{type:web}': ['rate<0.005'],
    'http_req_failed{type:desktop}': ['rate<0.005'],
    ai_chat_duration: ['p(95)<10000'],
    ai_health_duration: ['p(95)<3000'],
    health_check_duration: ['p(95)<1000'],
  },
};

export function setup() {
  const tokens = [];
  let communityId = null;

  for (let i = 0; i < USER_COUNT; i++) {
    const username = `loadtest-user-${i}`;
    const email = `loadtest-user-${i}@loadtest.threadverse`;
    const payload = JSON.stringify({ username, email, password: TEST_PASSWORD });
    const res = http.post(`${BASE_URL}/api/auth/register`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 201) {
      tokens.push(res.json('data.accessToken'));
    } else if (res.status === 409) {
      const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ email, password: TEST_PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (loginRes.status === 200) {
        tokens.push(loginRes.json('data.accessToken'));
      }
    }
    sleep(1);
  }

  if (tokens.length === 0) {
    throw new Error('Failed to create any test users');
  }

  const adminToken = tokens[0];
  if (adminToken) {
    const createRes = http.post(
      `${BASE_URL}/api/communities`,
      JSON.stringify({
        name: `loadtest-community-${Date.now()}`,
        description: 'Auto-created for load testing',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        timeout: '10s',
      }
    );
    if (createRes.status === 201) {
      communityId =
        createRes.json('data.id') || createRes.json('data.community.id') || createRes.json('data._id');
    }
    if (!communityId) {
      const listRes = http.get(`${BASE_URL}/api/communities`, { timeout: '10s' });
      if (listRes.status === 200) {
        const communities = listRes.json('data');
        if (communities && communities.length > 0) {
          communityId = communities[0]._id || communities[0].id;
        }
      }
    }
  }

  return {
    tokens,
    communityId: communityId || __ENV.COMMUNITY_ID || null,
  };
}

function pickToken(tokens) {
  return tokens[__VU % tokens.length];
}

function headersWithToken(token, extra) {
  return Object.assign(
    {},
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
    extra
  );
}

const MESSAGES = [
  'What is this community about?',
  'Tell me more',
  'Hi',
  'Can you summarize?',
  'Thanks',
  'Interesting',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function callAiChat(token, communityId) {
  const resp = http.post(
    `${BASE_URL}/api/ai/chat`,
    JSON.stringify({ message: randomItem(MESSAGES), communityId }),
    headersWithToken(token, { timeout: '30s' })
  );
  aiChatDuration.add(resp.timings.duration);
  if (resp.status === 200 && resp.body) {
    const tokenCount = (resp.body.match(/"type":"token"/g) || []).length;
    aiChatTokens.add(tokenCount);
    const hasDone = resp.body.includes('"data":{"conversationId"');
    check(resp, {
      'ai delivered tokens': () => tokenCount > 0,
      'ai stream completed': () => hasDone,
    });
  } else {
    check(resp, {
      'ai chat accepted': (r) => r.status === 200 || r.status === 429,
    });
  }
  return resp;
}

function healthCheck() {
  const resp = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
  healthCheckDuration.add(resp.timings.duration);
  if (resp.status === 200) {
    try {
      const body = JSON.parse(resp.body);
      healthDbStatus.add(body.db === 'connected');
      healthRedisStatus.add(body.redis === 'connected');
    } catch (e) {
    }
  }
}

function aiHealthCheck() {
  const resp = http.get(`${BASE_URL}/api/ai/health`, { timeout: '10s' });
  aiHealthDuration.add(resp.timings.duration);
  check(resp, {
    'ai health ok': (r) => r.status === 200,
  });
}

export function webUser(data) {
  const token = pickToken(data.tokens);

  group('web_user_session', () => {
    http.get(`${BASE_URL}/api/communities`);
    sleep(randomIntBetween(1, 3));

    http.get(`${BASE_URL}/api/posts`);
    sleep(randomIntBetween(1, 4));

    http.get(`${BASE_URL}/api/feed`, headersWithToken(token));
    sleep(randomIntBetween(1, 2));

    const roll = Math.random();

    if (roll < 0.10 && data.communityId) {
      callAiChat(token, data.communityId);
    } else if (roll < 0.20) {
      healthCheck();
    } else if (roll < 0.30) {
      http.get(`${BASE_URL}/api/ai/health`);
    } else if (roll < 0.45) {
      http.get(`${BASE_URL}/api/search?q=test`, headersWithToken(token));
    } else if (roll < 0.60) {
      http.get(`${BASE_URL}/api/auth/me`, headersWithToken(token));
    }

    sleep(randomIntBetween(1, 5));
  });
}

export function desktopClient(data) {
  const token = pickToken(data.tokens);

  group('desktop_client_session', () => {
    http.get(`${BASE_URL}/api/desktop/version`);
    sleep(randomIntBetween(1, 2));

    http.get(`${BASE_URL}/api/communities`);
    sleep(randomIntBetween(1, 3));

    http.get(`${BASE_URL}/api/posts`);
    sleep(randomIntBetween(1, 2));

    const roll = Math.random();

    if (roll < 0.20 && data.communityId) {
      callAiChat(token, data.communityId);
    } else if (roll < 0.40) {
      healthCheck();
    } else if (roll < 0.55) {
      aiHealthCheck();
    } else if (roll < 0.70) {
      http.get(`${BASE_URL}/api/auth/me`, headersWithToken(token));
    }

    sleep(randomIntBetween(2, 5));
  });
}
