const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', (e) => {
            console.error(`Request error: ${e.message}`);
            resolve({ status: 500, error: e });
        });
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTest() {
    console.log('Starting DELETE endpoint verification...');

    // 1. Create two patients
    const p1Data = {
        firstName: "Delete", lastName: "Test1", patientId: "DEL001",
        teamName: "Test", dateOfBirth: "1990-01-01", shipToId: "1483051"
    };
    const p2Data = {
        firstName: "Delete", lastName: "Test2", patientId: "DEL002",
        teamName: "Test", dateOfBirth: "1990-01-01", shipToId: "1483051"
    };

    console.log('Creating patients...');
    const createRes1 = await request({
        hostname: 'localhost', port: 5178, path: '/api/patients', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, p1Data);

    const createRes2 = await request({
        hostname: 'localhost', port: 5178, path: '/api/patients', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, p2Data);

    if (createRes1.status !== 201 || createRes2.status !== 201) {
        console.error('Failed to create patients', createRes1.status, createRes2.status);
        return;
    }

    const keys = [createRes1.body.patientKey, createRes2.body.patientKey];
    console.log('Created patients with keys:', keys);

    // 2. Delete them using new endpoint
    const query = `patientKeys=${keys[0]}&patientKeys=${keys[1]}`;
    const path = `/api/patients/1483051?${query}`;
    console.log(`Testing DELETE ${path}`);

    const deleteRes = await request({
        hostname: 'localhost', port: 5178, path: path, method: 'DELETE'
    });

    console.log('DELETE Response Status:', deleteRes.status);
    console.log('DELETE Response Body:', JSON.stringify(deleteRes.body, null, 2));

    // 3. Verify response structure
    if (deleteRes.status === 200 && deleteRes.body.results && deleteRes.body.results.length === 2) {
        const allSuccess = deleteRes.body.results.every(r => r.status === 'SUCCESS');
        if (allSuccess) {
            console.log('SUCCESS: API reported success for all keys.');
        } else {
            console.error('FAILURE: API response contained failures.');
        }
    } else {
        console.error('FAILURE: Unexpected response structure or status.');
    }

    // 4. Verify they are gone
    console.log('Verifying patients are gone...');
    const checkRes1 = await request({
        hostname: 'localhost', port: 5178, path: `/api/patients/${keys[0]}`, method: 'GET'
    });
    const checkRes2 = await request({
        hostname: 'localhost', port: 5178, path: `/api/patients/${keys[1]}`, method: 'GET'
    });

    if (checkRes1.status === 404 && checkRes2.status === 404) {
        console.log('SUCCESS: Patients verified as deleted (404 Not Found).');
    } else {
        console.error('FAILURE: Patients still exist!', checkRes1.status, checkRes2.status);
    }
}

runTest().catch(console.error);
