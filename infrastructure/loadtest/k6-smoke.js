// k6 smoke load test for Cromo.
//
// Run against a local Docker stack:
//   docker run --rm -i --network host -v $PWD/infrastructure/loadtest:/loadtest \
//     grafana/k6 run /loadtest/k6-smoke.js
//
// Or natively if k6 is installed:
//   k6 run infrastructure/loadtest/k6-smoke.js
//
// Per overview.md §31 A7 milestone: "Load test with k6 against local Docker
// environment." The thresholds below are sized for a single laptop, not for
// cloud capacity planning.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3001';
const FRONTEND = __ENV.FRONTEND_URL || 'http://localhost:3000';

const stickersLatency = new Trend('stickers_list_ms', true);
const healthLatency = new Trend('health_ms', true);

export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 5 },   // warm up
        { duration: '40s', target: 25 },  // sustained
        { duration: '10s', target: 0 },   // cool down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed:    ['rate<0.01'],          // <1% errors
    http_req_duration:  ['p(95)<400', 'p(99)<800'],
    stickers_list_ms:   ['p(95)<300'],
    health_ms:          ['p(99)<100'],
  },
};

function login(email) {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email, password: 'anything' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  return res.json('accessToken');
}

export default function () {
  group('public', () => {
    const h = http.get(`${BASE}/health`, { tags: { endpoint: 'health' } });
    healthLatency.add(h.timings.duration);
    check(h, { 'health 200': (r) => r.status === 200 });

    const sl = http.get(`${BASE}/api/v1/stickers`, { tags: { endpoint: 'stickers' } });
    stickersLatency.add(sl.timings.duration);
    check(sl, {
      'stickers 200': (r) => r.status === 200,
      'stickers list non-empty': (r) => {
        try {
          const arr = r.json();
          return Array.isArray(arr) ? arr.length > 0 : (arr.items || []).length > 0;
        } catch { return false; }
      },
    });
  });

  group('authenticated', () => {
    const token = login(`alice@test.local`);
    if (!token) return;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const albums = http.get(`${BASE}/api/v1/users/me/albums`, { headers, tags: { endpoint: 'albums' } });
    check(albums, { 'albums 200 or 404': (r) => r.status === 200 || r.status === 404 });

    const profile = http.get(`${FRONTEND}/`, { tags: { endpoint: 'frontend_root' } });
    check(profile, { 'frontend 200': (r) => r.status === 200 });
  });

  sleep(1);
}
