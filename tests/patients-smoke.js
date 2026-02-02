const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { /* ignore */ }
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

  console.log('1) POST /api/v1/patients');
  const newPatient = {
    firstName: 'Test',
    lastName: 'Patient',
    admissionDate: new Date().toISOString(),
    insurance: { providerName: 'MockIns', policyNumber: 'P123' },
    address: { street: '1 Main St', city: 'Town', state: 'TS', zipCode: '12345', country: 'US' }
  };

  let resp = await request({ ...base, path: '/api/v1/patients', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify(newPatient));
  ok(resp.status === 201, `expected 201, got ${resp.status} - ${resp.body}`);
  const created = resp.json;
  ok(created && created.id, 'created resource missing id');
  const id = created.id;
  console.log('  created id =', id);

  console.log('2) GET /api/v1/patients/' + id);
  resp = await request({ ...base, path: '/api/v1/patients/' + id, method: 'GET' });
  ok(resp.status === 200, `GET expected 200 got ${resp.status}`);
  ok(resp.json.firstName === 'Test', 'firstName mismatch');

  console.log('3) PATCH pin /api/v1/patients/' + id);
  resp = await request({ ...base, path: '/api/v1/patients/' + id, method: 'PATCH', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ isPinned: true }));
  ok(resp.status === 200, `PATCH expected 200 got ${resp.status} - ${resp.body}`);
  ok(resp.json.isPinned === true, 'isPinned not true after patch');
  ok(resp.json.metadata && resp.json.metadata.createdAt, 'metadata missing createdAt');

  console.log('4) PUT full update /api/v1/patients/' + id);
  const full = Object.assign({}, resp.json, { lastName: 'Updated' });
  resp = await request({ ...base, path: '/api/v1/patients/' + id, method: 'PUT', headers: { 'Content-Type': 'application/json' } }, JSON.stringify(full));
  ok(resp.status === 200, `PUT expected 200 got ${resp.status}`);
  ok(resp.json.lastName === 'Updated', 'PUT did not update lastName');

  console.log('5) DELETE /api/v1/patients/' + id);
  resp = await request({ ...base, path: '/api/v1/patients/' + id, method: 'DELETE' });
  ok(resp.status === 204, `DELETE expected 204 got ${resp.status} - ${resp.body}`);

  console.log('6) GET after DELETE should be 404');
  resp = await request({ ...base, path: '/api/v1/patients/' + id, method: 'GET' });
  ok(resp.status === 404, `expected 404 got ${resp.status}`);

  console.log('ALL PATIENT SMOKE TESTS PASSED');
  process.exit(0);
})();
