const http = require('http');

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(body);
                let parsed = null;
                try {
                    if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                        parsed = JSON.parse(buffer.toString());
                    }
                } catch (e) {
                    // ignore
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, buffer: buffer });
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
    console.log('--- Starting DELETE Verification ---');

    // 1. Create two patients
    const p1Data = {
        firstName: "Delete", lastName: "Test1", patientId: "DEL001",
        teamName: "Test", dateOfBirth: "1990-01-01", shipToId: "1483051"
    };
    const p2Data = {
        firstName: "Delete", lastName: "Test2", patientId: "DEL002",
        teamName: "Test", dateOfBirth: "1990-01-01", shipToId: "1483051"
    };

    const createRes1 = await request({
        hostname: '127.0.0.1', port: 5178, path: '/api/patients', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, p1Data);

    const createRes2 = await request({
        hostname: '127.0.0.1', port: 5178, path: '/api/patients', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, p2Data);

    if (createRes1.status !== 201 || createRes2.status !== 201) {
        console.error('Failed to create patients', createRes1.status, createRes2.status);
    } else {
        const keys = [createRes1.body.patientKey, createRes2.body.patientKey];
        console.log('Created patients keys:', keys);

        // 2. Delete them
        const query = `patientKeys=${keys[0]}&patientKeys=${keys[1]}`;
        const path = `/api/patients/1483051?${query}`;

        const deleteRes = await request({
            hostname: '127.0.0.1', port: 5178, path: path, method: 'DELETE'
        });

        console.log('DELETE Status:', deleteRes.status);
        if (deleteRes.status === 200 && deleteRes.body && deleteRes.body.results && deleteRes.body.results.length === 2) {
            console.log('DELETE Success Check passed.');
        } else {
            console.error('DELETE Check failed:', JSON.stringify(deleteRes.body));
        }
    }

    console.log('\n--- Starting DOWNLOAD Verification ---');
    // 3. Test Download
    const downloadPath = '/api/patient/download/1483051';
    const downloadRes = await request({
        hostname: '127.0.0.1', port: 5178, path: downloadPath, method: 'GET',
        headers: {
            'Authorization': 'test'
        }
    });

    console.log('DOWNLOAD Status:', downloadRes.status);
    console.log('DOWNLOAD Content-Type:', downloadRes.headers['content-type']);
    console.log('DOWNLOAD Content-Disposition:', downloadRes.headers['content-disposition']);

    if (downloadRes.status === 200 &&
        downloadRes.headers['content-type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        downloadRes.headers['content-disposition'].includes('export.xlsx')) {
        console.log('DOWNLOAD (Standard) Verification PASSED: Received Excel file blob.');
    } else {
        console.error('DOWNLOAD (Standard) Verification FAILED.');
    }

    // 4. Test Download (APIC)
    console.log('\n--- Starting APIC DOWNLOAD Verification ---');
    const apicDownloadPath = '/api/apic/patients/download/1483051';
    const apicDownloadRes = await request({
        hostname: '127.0.0.1', port: 5178, path: apicDownloadPath, method: 'GET',
        headers: {
            'Authorization': 'test'
        }
    });

    console.log('APIC DOWNLOAD Status:', apicDownloadRes.status);

    if (apicDownloadRes.status === 200 &&
        apicDownloadRes.headers['content-type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        console.log('DOWNLOAD (APIC) Verification PASSED.');
    } else {
        console.error('DOWNLOAD (APIC) Verification FAILED.');
    }
}
runTest().catch(console.error);
