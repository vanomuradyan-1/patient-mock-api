const http = require('http');

const data = JSON.stringify({
    "facilityId": "1483051",
    "barcodeInfo": [
        {
            "barcodeDesc": "Mahi1, Dhoni",
            "barcodeText": "",
            "barcodeValue": "CC6556FB4D7D4D2DB7378C0FC65FE84C",
            "secondaryDesc": ""
        },
        {
            "barcodeDesc": "Mahi2, Dhoni",
            "barcodeText": "",
            "barcodeValue": "BF2F70B6441F45109DB72BBF2D3A64CE",
            "secondaryDesc": ""
        }
    ],
    "paperFormat": "A4",
    "printCodeOnLabel": true,
    "labelType": "REGULAR"
});

const options = {
    hostname: 'localhost',
    port: 5178,
    path: '/api/apic/ecom/barcode/label/v1/print',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        try {
            const parsedData = JSON.parse(responseData);
            console.log('Response Body:', JSON.stringify(parsedData, null, 2));
        } catch (e) {
            console.log('Response Body (Raw):', responseData);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
