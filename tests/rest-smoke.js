const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const base = { hostname: 'localhost', port: 5178 };
  function ok(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

  console.log('1) POST /users');
  let resp = await request({ ...base, path: '/users', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ name: 'Smoke User', email: 'smoke@example.com' }));
  ok(resp.status === 201, `expected 201, got ${resp.status}`);
  const created = resp.json;
  ok(created && created.id, 'created resource missing id');
  const id = created.id;
  console.log('  created id =', id);

  console.log('2) GET /users/' + id);
  resp = await request({ ...base, path: '/users/' + id, method: 'GET' });
  ok(resp.status === 200, `GET expected 200 got ${resp.status}`);
  const got = resp.json;
  ok(got.name === 'Smoke User', 'name mismatch');

  console.log('3) PATCH /users/' + id);
  resp = await request({ ...base, path: '/users/' + id, method: 'PATCH', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ email: 'patched@example.com' }));
  ok(resp.status === 200, `PATCH expected 200 got ${resp.status}`);
  const patched = resp.json;
  ok(patched.email === 'patched@example.com', 'patch did not update email');

  console.log('4) PUT /users/' + id);
  resp = await request({ ...base, path: '/users/' + id, method: 'PUT', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ name: 'Replaced User', email: 'replaced@example.com' }));
  ok(resp.status === 200, `PUT expected 200 got ${resp.status}`);
  const putted = resp.json;
  ok(putted.name === 'Replaced User', 'put did not replace name');

  console.log('5) DELETE /users/' + id);
  resp = await request({ ...base, path: '/users/' + id, method: 'DELETE' });
  ok(resp.status === 204, `DELETE expected 204 got ${resp.status}`);

  console.log('6) GET after DELETE should be 404');
  resp = await request({ ...base, path: '/users/' + id, method: 'GET' });
  ok(resp.status === 404, `expected 404 got ${resp.status}`);

  console.log('ALL SMOKE TESTS PASSED');
  process.exit(0);
})();
