const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const { randomUUID } = require('crypto');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require("cors");

const app = express();
const PORT = 5178;

// middleware
app.use(express.json());
app.use(cors('*'));
app.use(express.static('public'));

// method-override support for clients that can't send PATCH/PUT/DELETE
app.use((req, res, next) => {
    const override = req.get("X-HTTP-Method-Override") || req.query && req.query._method;
    if (override) {
        req.method = override.toUpperCase();
    }
    next();
});

// simple request logger for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
    next();
});

// simple middleware to require JSON content-type for modifying requests
function requireJson(req, res, next) {
    const method = req.method.toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method)) {
        if (!req.is("application/json")) {
            return handleError(res, 415, "Content-Type must be application/json", "INVALID_CONTENT_TYPE");
        }
    }
    next();
}
app.use(requireJson);

// helper to send consistent error responses
// helper to send consistent error responses
function handleError(res, status, message, errorCode = null, details = null) {
    const response = {
        code: status,
        message: message
    };
    if (errorCode) response.errorCode = errorCode;
    if (details) response.details = details;
    return res.status(status).json(response);
}

// ensure database file exists (will be gitignored in feature)
const DB_PATH = path.join(__dirname, "database.db");
try {
    if (!fs.existsSync(DB_PATH)) {
        // create an empty file so sqlite can open it
        fs.closeSync(fs.openSync(DB_PATH, "w"));
        console.log(`Created new database file at ${DB_PATH}`);
    }
} catch (err) {
    console.error("Failed checking/creating database file:", err);
}

// database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("DB Error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// create table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL
  )
`);

// SWAGGER DOCS
const swaggerDocument = YAML.load('./swagger.yaml');
const swaggerOptions = {
    swaggerOptions: {
        authAction: {
            jwtTokenAuth: {
                name: "jwtTokenAuth",
                schema: { type: "apiKey", in: "header", name: "Authorization", description: "" },
                value: "Bearer test"
            },
            PingTokenAuth: {
                name: "PingTokenAuth",
                schema: { type: "apiKey", in: "header", name: "Ping-Authorization", description: "" },
                value: "ping"
            }
        }
    }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

// Admin page route (root)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ------------------- API BASE -------------------
const API_BASE = '/api/v1';

// ------------------- ADMIN UTILITIES -------------------

// DELETE - Clear all patients
app.delete(`${API_BASE}/admin/clear`, (req, res) => {
    db.run('DELETE FROM patients', [], function (err) {
        if (err) return handleError(res, 500, err.message || 'DB error');
        res.json({
            success: true,
            deletedCount: this.changes,
            message: `Deleted ${this.changes} patient(s)`
        });
    });
});

// POST - Generate mock patients
app.post(`${API_BASE}/admin/generate`, (req, res) => {
    const count = parseInt(req.body.count) || 10;

    if (count < 1 || count > 1000) {
        return handleError(res, 400, 'Count must be between 1 and 1000');
    }

    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Mary', 'William', 'Patricia', 'Richard', 'Jennifer', 'Thomas', 'Linda'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'];
    const teams = ['Red Team', 'Blue Team', 'Green Team', 'Yellow Team', 'Purple Team'];
    const agencies = [
        { name: 'HealthCare Plus', id: 'A100' },
        { name: 'MediCare Services', id: 'A200' },
        { name: 'Wellness Group', id: 'A300' }
    ];
    const statuses = ['ACTIVE', 'DISCHARGED', 'PENDING'];
    const insuranceProviders = ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth', 'Humana'];

    const randomDate = (start, end) => {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
    };

    const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

    let generated = 0;
    const createdAt = new Date().toISOString();

    const insertPatient = (i) => {
        if (i >= count) {
            return res.json({
                success: true,
                generatedCount: generated,
                message: `Generated ${generated} patient(s)`
            });
        }

        const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : randomUUID();
        const firstName = randomItem(firstNames);
        const lastName = randomItem(lastNames);
        const dob = randomDate(new Date(1940, 0, 1), new Date(2010, 0, 1));
        const team = { name: randomItem(teams) };
        const agency = randomItem(agencies);
        const insurance = {
            providerName: randomItem(insuranceProviders),
            policyNumber: Math.random().toString(36).substring(2, 8).toUpperCase(),
            groupNumber: 'GRP' + Math.floor(Math.random() * 1000)
        };
        const lastOrder = {
            id: 'ORD-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
            date: randomDate(new Date(2023, 0, 1), new Date()),
            status: randomItem(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'])
        };
        const status = randomItem(statuses);
        const isPinned = Math.random() > 0.8 ? 1 : 0;
        const metadata = {
            createdAt,
            createdBy: 'admin-generator',
            updatedAt: createdAt,
            updatedBy: 'admin-generator'
        };

        const sql = `INSERT INTO patients (id,firstName,lastName,dateOfBirth,email,insurance,status,isPinned,metadata,team,agency,lastOrder) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
        const params = [
            id,
            firstName,
            lastName,
            dob,
            `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
            JSON.stringify(insurance),
            status,
            isPinned,
            JSON.stringify(metadata),
            JSON.stringify(team),
            JSON.stringify(agency),
            JSON.stringify(lastOrder)
        ];

        db.run(sql, params, function (err) {
            if (!err) generated++;
            insertPatient(i + 1);
        });
    };

    insertPatient(0);
});

// ------------------- PATIENTS API (/api/v1/patients) -------------------


// create patients table (JSON columns for nested objects)
db.run(`
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    guid TEXT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    dateOfBirth TEXT,
    gender TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    roomNumber TEXT,
    bedNumber TEXT,
    admissionDate TEXT,
    dischargeDate TEXT,
    primaryPhysician TEXT,
    payer TEXT,
    insurance TEXT,
    diagnosisCodes TEXT,
    status TEXT,
    isPinned INTEGER DEFAULT 0,
    metadata TEXT,
    team TEXT,
    agency TEXT,
    lastOrder TEXT
  )
`);

function rowToPatient(row) {
    if (!row) return null;
    return {
        id: row.id,
        guid: row.guid || null,
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        phone: row.phone,
        email: row.email || undefined,
        address: row.address ? JSON.parse(row.address) : undefined,
        roomNumber: row.roomNumber || undefined,
        bedNumber: row.bedNumber || undefined,
        bedNumber: row.bedNumber || undefined,
        // admissionDate: row.admissionDate, // Removed from interface
        dischargeDate: row.dischargeDate || undefined,
        primaryPhysician: row.primaryPhysician ? JSON.parse(row.primaryPhysician) : undefined,
        payer: row.payer || undefined,
        insurance: row.insurance ? JSON.parse(row.insurance) : undefined,
        diagnosisCodes: row.diagnosisCodes ? JSON.parse(row.diagnosisCodes) : undefined,
        status: row.status,
        isPinned: !!row.isPinned,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        team: row.team ? JSON.parse(row.team) : undefined,
        agency: row.agency ? JSON.parse(row.agency) : undefined,
        lastOrder: row.lastOrder ? JSON.parse(row.lastOrder) : undefined,


    };
}

function rowToPatientSearch(row) {
    if (!row) return null;
    const pat = rowToPatient(row);
    // Map existing insurance to new 'payer' structure
    let payerObj = undefined;
    if (pat.insurance) {
        payerObj = {
            payerTypeName: pat.payer || "Private Insurance/Self Pay", // Use stored payer or default
            planName: pat.insurance.providerName || "Unknown",
            planId: pat.insurance.policyNumber || undefined,
            groupNumber: pat.insurance.groupNumber || undefined
        };
    }

    return {
        patientId: pat.id,
        firstName: pat.firstName,
        lastName: pat.lastName,
        dob: pat.dateOfBirth,
        team: pat.team ? pat.team.name : undefined,
        isPinned: pat.isPinned,
        lastOrder: pat.lastOrder,
        payer: payerObj
    };
}

// Allowed fields for sorting to avoid SQL injection
const ALLOWED_SORT_FIELDS = new Set(['admissionDate', 'lastName', 'firstName', 'dateOfBirth']);
const ALLOWED_SORT_FIELDS_V2 = new Set(['LAST_NAME', 'FIRST_NAME', 'TEAM', 'ADDRESS', 'PATIENT_ID']);

// ------------------- V2 ENDPOINTS -------------------

// SEARCH - GET /api/v1/patients/search
app.get(`${API_BASE}/patients/search`, (req, res) => {
    // 1. Header Validation
    const auth = req.get('Authorization');
    const pingAuth = req.get('Ping-Authorization');

    if (!auth) return handleError(res, 401, "Unauthorized", null, "Full authentication is required to access this resource. Missing or invalid Authorization header.");
    if (!pingAuth) return handleError(res, 401, "Unauthorized", null, "Missing required Ping-Authorization header.");

    // 2. Query Param Validation
    const errors = [];
    const soldTo = req.query.soldTo;
    if (!soldTo) errors.push("Required parameter 'soldTo' is missing");
    else if (soldTo.trim() === "") errors.push("soldTo is required and cannot be empty");

    const pageNo = Number(req.query.pageNo);
    if (req.query.pageNo !== undefined && (isNaN(pageNo) || pageNo < 1)) errors.push("Invalid query parameter: pageNo must be greater than or equal to 1");

    const pageSize = Number(req.query.pageSize);
    if (req.query.pageSize !== undefined && (isNaN(pageSize) || pageSize < 1 || pageSize > 100)) errors.push("Invalid query parameter: pageSize must be between 1 and 100");

    const sortBy = req.query.sortBy;
    if (sortBy && !ALLOWED_SORT_FIELDS_V2.has(sortBy)) errors.push("Invalid sortBy value. Must be one of: LAST_NAME, FIRST_NAME, TEAM, ADDRESS, PATIENT_ID");

    const sortMethod = req.query.sortMethod;
    if (sortMethod && !['ASC', 'DESC'].includes(sortMethod)) errors.push("Invalid sortMethod value. Must be one of: ASC, DESC");

    if (errors.length > 0) {
        return handleError(res, 400, "Bad Request", null, errors.length === 1 ? errors[0] : errors.join('; '));
    }

    // 3. Execution
    const q = (req.query.q || '').trim();
    const pNo = Math.max(1, pageNo || 1);
    const pSize = Math.max(1, Math.min(100, pageSize || 25));
    const offset = (pNo - 1) * pSize;

    // Sort Mapping
    let dbSort = 'lastName ASC'; // default
    if (sortBy) {
        const dir = (sortMethod === 'DESC') ? 'DESC' : 'ASC';
        switch (sortBy) {
            case 'LAST_NAME': dbSort = `lastName ${dir}`; break;
            case 'FIRST_NAME': dbSort = `firstName ${dir}`; break;
            case 'PATIENT_ID': dbSort = `id ${dir}`; break;
            // TEAM and ADDRESS are JSON/Text fields, sorting might be tricky or plain text. 
            // For mock, simple text sort or ignore complex logic.
            case 'TEAM': dbSort = `team ${dir}`; break;
            case 'ADDRESS': dbSort = `address ${dir}`; break;
        }
    }

    const where = [];
    const params = [];

    if (q) {
        where.push("LOWER(firstName || ' ' || lastName || ' ' || COALESCE(guid,'') || ' ' || COALESCE(email,'')) LIKE ?");
        params.push('%' + q.toLowerCase() + '%');
    }

    // soldTo is required but we don't have a column for it in this mock DB. 
    // We'll ignore filtering by it but acknowledge its presence.

    const whereClause = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    db.get(`SELECT COUNT(*) as cnt FROM patients ${whereClause}`, params, (err, countRow) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        const totalRecords = countRow ? countRow.cnt : 0;
        const pagesCount = Math.ceil(totalRecords / pSize);

        const sql = `SELECT * FROM patients ${whereClause} ORDER BY ${dbSort} LIMIT ? OFFSET ?`;
        db.all(sql, [...params, pSize, offset], (err2, rows) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            const patients = rows.map(rowToPatientSearch);

            res.json({
                patients,
                totalRecords,
                pageNo: pNo,
                pagesCount
            });
        });
    });
});

// PIN - PUT /api/v1/patients/:id/pin
app.put(`${API_BASE}/patients/:id/pin`, (req, res) => {
    const id = req.params.id;
    if (!id) return handleError(res, 400, 'Invalid id');

    const body = req.body || {};
    // Expect { isPinned: boolean }
    if (body.isPinned === undefined) {
        return handleError(res, 400, "Bad Request", null, "Required parameter 'isPinned' is missing");
    }

    const isPinned = body.isPinned ? 1 : 0;

    // We update only isPinned. 
    // Spec doesn't mention full metadata update, but let's be nice and touch updatedAt
    const updatedAt = new Date().toISOString();
    // We assume we can't get X-User here easily or just ignore. 
    // But let's try to update metadata if we can, otherwise just simple update.

    db.get('SELECT metadata FROM patients WHERE id = ?', [id], (mErr, mRow) => {
        if (mErr) return handleError(res, 500, mErr.message || 'DB error');
        if (!mRow) return handleError(res, 404, 'Patient not found'); // Check existence first

        let existingMeta = {};
        try { existingMeta = mRow.metadata ? JSON.parse(mRow.metadata) : {}; } catch (e) { }

        const mergedMeta = {
            ...existingMeta,
            updatedAt
        };

        db.run('UPDATE patients SET isPinned = ?, metadata = ? WHERE id = ?', [isPinned, JSON.stringify(mergedMeta), id], function (err) {
            if (err) return handleError(res, 500, err.message || 'DB error');
            res.sendStatus(200);
        });
    });
});



// LIST & SEARCH - GET /api/v1/patients
app.get(`${API_BASE}/patients`, (req, res) => {
    const q = (req.query.q || '').trim();
    const pageNo = Math.max(1, Number(req.query.pageNo) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 25));
    const offset = (pageNo - 1) * pageSize;

    const sortBy = req.query.sortBy || 'firstName'; // default changed to firstName based on user example implied preference
    const sortMethod = (req.query.sortMethod || 'asc').toUpperCase();

    // Sort validation
    const allowedSort = ['firstName', 'lastName', 'dateOfBirth', 'admissionDate'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'firstName';
    const safeSortMethod = ['ASC', 'DESC'].includes(sortMethod) ? sortMethod : 'ASC';

    const sortClause = `${safeSortBy} ${safeSortMethod}`;

    const where = [];
    const params = [];

    if (q) {
        where.push("LOWER(firstName || ' ' || lastName || ' ' || COALESCE(guid,'') || ' ' || COALESCE(email,'')) LIKE ?");
        params.push('%' + q.toLowerCase() + '%');
    }

    if (req.query.isPinned !== undefined) {
        const pinned = String(req.query.isPinned).toLowerCase() === 'true' ? 1 : 0;
        where.push('isPinned = ?');
        params.push(pinned);
    }

    const whereClause = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    db.get(`SELECT COUNT(*) as cnt FROM patients ${whereClause}`, params, (err, countRow) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        const totalRecords = countRow ? countRow.cnt : 0;
        const pagesCount = Math.ceil(totalRecords / pageSize);

        const sql = `SELECT * FROM patients ${whereClause} ORDER BY ${sortClause} LIMIT ? OFFSET ?`;
        db.all(sql, [...params, pageSize, offset], (err2, rows) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            const data = rows.map(rowToPatient);

            res.json({
                data,
                totalRecords,
                pageNo,
                curentPageSize: pageSize, // User requested specific typo
                pagesCount
            });
        });
    });
});

// GET single patient - GET /api/v1/patients/:id
app.get(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    if (!id) return handleError(res, 400, 'Invalid id');
    db.get('SELECT * FROM patients WHERE id = ?', [id], (err, row) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        if (!row) return handleError(res, 404, 'Patient not found');
        res.json(rowToPatient(row));
    });
});

// CREATE patient - POST /api/v1/patients
app.post(`${API_BASE}/patients`, (req, res) => {
    const body = req.body || {};
    // minimal validation
    const errors = [];

    const required = ['firstName', 'lastName', 'insurance'];
    required.forEach(field => {
        if (!body[field]) errors.push(`${field} is required`);
    });

    // Basic format validation
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) errors.push("Invalid email format");
    if (body.gender && !['MALE', 'FEMALE', 'OTHER'].includes(body.gender)) errors.push("Invalid gender");

    if (errors.length > 0) {
        return handleError(res, 400, "Validation Failed", "VAL_ERR", errors);
    }

    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : randomUUID();
    const createdAt = new Date().toISOString();
    const createdBy = req.get('X-User') || 'system';

    const patient = {
        id,
        guid: body.guid || null,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth || null,
        gender: body.gender || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address ? body.address : null,
        roomNumber: body.roomNumber || null,
        bedNumber: body.bedNumber || null,
        admissionDate: body.admissionDate,
        dischargeDate: body.dischargeDate || null,
        primaryPhysician: body.primaryPhysician || null,
        payer: body.payer || null,
        insurance: body.insurance,
        diagnosisCodes: Array.isArray(body.diagnosisCodes) ? body.diagnosisCodes : null,
        status: body.status || 'ACTIVE',
        isPinned: body.isPinned ? 1 : 0,
        metadata: {
            createdAt,
            createdBy,
            updatedAt: createdAt,
            updatedBy: createdBy,
        },
        team: body.team || null,
        agency: body.agency || null,
        lastOrder: body.lastOrder || null
    };

    // Check for duplicates (Simple check: Guid or Name+DOB)
    db.get("SELECT id FROM patients WHERE (firstName = ? AND lastName = ? AND dateOfBirth = ?)",
        [patient.firstName, patient.lastName, patient.dateOfBirth], (err, row) => {
            if (err) return handleError(res, 500, err.message || 'DB error');
            if (row) {
                return handleError(res, 409, "Patient already exists", "DUP_PATIENT", [`Patient with name ${patient.firstName} ${patient.lastName} and DOB ${patient.dateOfBirth} already exists`]);
            }

            const sql = `INSERT INTO patients (id,guid,firstName,lastName,dateOfBirth,gender,phone,email,address,roomNumber,bedNumber,admissionDate,dischargeDate,primaryPhysician,payer,insurance,diagnosisCodes,status,isPinned,metadata,team,agency,lastOrder) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
            const params = [
                patient.id,
                patient.guid,
                patient.firstName,
                patient.lastName,
                patient.dateOfBirth,
                patient.gender,
                patient.phone,
                patient.email,
                patient.address ? JSON.stringify(patient.address) : null,
                patient.roomNumber,
                patient.bedNumber,
                patient.admissionDate,
                patient.dischargeDate,
                patient.primaryPhysician ? JSON.stringify(patient.primaryPhysician) : null,
                patient.payer,
                patient.insurance ? JSON.stringify(patient.insurance) : null,
                patient.diagnosisCodes ? JSON.stringify(patient.diagnosisCodes) : null,
                patient.status,
                patient.isPinned ? 1 : 0,
                JSON.stringify(patient.metadata),
                patient.team ? JSON.stringify(patient.team) : null,
                patient.agency ? JSON.stringify(patient.agency) : null,
                patient.lastOrder ? JSON.stringify(patient.lastOrder) : null,
            ];

            db.run(sql, params, function (err) {
                if (err) return handleError(res, 500, err.message || 'DB error');
                const host = (req.get('X-Forwarded-Host') || req.get('host'));
                const proto = req.get('X-Forwarded-Proto') || req.protocol;
                const loc = host ? `${proto}://${host}${API_BASE}/patients/${patient.id}` : `${API_BASE}/patients/${patient.id}`;
                res.status(201).location(loc).json(patient);
            });
        });
});



// PUT - full update
app.put(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    const body = req.body || {};
    if (!id) return handleError(res, 400, 'Invalid id');
    // require full object: at least firstName, lastName, admissionDate, insurance
    const errors = [];
    const required = ['firstName', 'lastName', 'insurance'];
    required.forEach(field => {
        if (!body[field]) errors.push(`${field} is required for full update`);
    });

    // Basic format validation
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) errors.push("Invalid email format");
    if (body.gender && !['MALE', 'FEMALE', 'OTHER'].includes(body.gender)) errors.push("Invalid gender");

    if (errors.length > 0) {
        return handleError(res, 400, "Validation Failed", "VAL_ERR", errors);
    }
    const updatedAt = new Date().toISOString();
    const updatedBy = req.get('X-User') || 'system';

    const updates = {
        guid: body.guid || null,
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth || null,
        gender: body.gender || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address ? JSON.stringify(body.address) : null,
        roomNumber: body.roomNumber || null,
        bedNumber: body.bedNumber || null,
        admissionDate: body.admissionDate,
        dischargeDate: body.dischargeDate || null,
        primaryPhysician: body.primaryPhysician ? JSON.stringify(body.primaryPhysician) : null,
        payer: body.payer || null,
        insurance: body.insurance ? JSON.stringify(body.insurance) : null,
        diagnosisCodes: Array.isArray(body.diagnosisCodes) ? JSON.stringify(body.diagnosisCodes) : null,
        status: body.status || 'ACTIVE',
        isPinned: body.isPinned ? 1 : 0,
        metadata: JSON.stringify({ updatedAt, updatedBy, createdAt: (body.metadata && body.metadata.createdAt) || updatedAt, createdBy: (body.metadata && body.metadata.createdBy) || updatedBy }),
        team: body.team ? JSON.stringify(body.team) : null,
        agency: body.agency ? JSON.stringify(body.agency) : null,
        lastOrder: body.lastOrder ? JSON.stringify(body.lastOrder) : null
    };

    const sql = `UPDATE patients SET guid=?,firstName=?,lastName=?,dateOfBirth=?,gender=?,phone=?,email=?,address=?,roomNumber=?,bedNumber=?,admissionDate=?,dischargeDate=?,primaryPhysician=?,payer=?,insurance=?,diagnosisCodes=?,status=?,isPinned=?,metadata=?,team=?,agency=?,lastOrder=? WHERE id = ?`;
    const params = [
        updates.guid,
        updates.firstName,
        updates.lastName,
        updates.dateOfBirth,
        updates.gender,
        updates.phone,
        updates.email,
        updates.address,
        updates.roomNumber,
        updates.bedNumber,
        updates.admissionDate,
        updates.dischargeDate,
        updates.primaryPhysician,
        updates.payer,
        updates.insurance,
        updates.diagnosisCodes,
        updates.status,
        updates.isPinned,
        updates.metadata,
        updates.team,
        updates.agency,
        updates.lastOrder,
        id,
    ];

    db.run(sql, params, function (err) {
        if (err) return handleError(res, 500, err.message || 'DB error');
        if (this.changes === 0) return handleError(res, 404, 'Patient not found');
        db.get('SELECT * FROM patients WHERE id = ?', [id], (err2, row) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            res.json(rowToPatient(row));
        });
    });
});

// PATCH - partial update
app.patch(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    if (!id) return handleError(res, 400, 'Invalid id');
    const body = req.body || {};

    const up = {};
    const fields = [];
    const params = [];

    const add = (column, value) => {
        fields.push(`${column} = ?`);
        params.push(value);
    };

    if (body.firstName !== undefined) add('firstName', body.firstName);
    if (body.lastName !== undefined) add('lastName', body.lastName);
    if (body.dateOfBirth !== undefined) add('dateOfBirth', body.dateOfBirth);
    if (body.gender !== undefined) {
        const allowedG = ['MALE', 'FEMALE', 'OTHER'];
        if (!allowedG.includes(body.gender)) return handleError(res, 400, 'Invalid gender');
        add('gender', body.gender);
    }
    if (body.phone !== undefined) add('phone', body.phone);
    if (body.email !== undefined) add('email', body.email);
    if (body.address !== undefined) add('address', body.address ? JSON.stringify(body.address) : null);
    if (body.roomNumber !== undefined) add('roomNumber', body.roomNumber);
    if (body.bedNumber !== undefined) add('bedNumber', body.bedNumber);
    if (body.admissionDate !== undefined) add('admissionDate', body.admissionDate);
    if (body.dischargeDate !== undefined) add('dischargeDate', body.dischargeDate);
    if (body.primaryPhysician !== undefined) add('primaryPhysician', body.primaryPhysician ? JSON.stringify(body.primaryPhysician) : null);
    if (body.payer !== undefined) add('payer', body.payer);
    if (body.insurance !== undefined) add('insurance', body.insurance ? JSON.stringify(body.insurance) : null);
    if (body.diagnosisCodes !== undefined) add('diagnosisCodes', Array.isArray(body.diagnosisCodes) ? JSON.stringify(body.diagnosisCodes) : null);
    if (body.status !== undefined) {
        const allowedS = ['ACTIVE', 'DISCHARGED', 'PENDING'];
        if (!allowedS.includes(body.status)) return handleError(res, 400, 'Invalid status');
        add('status', body.status);
    }
    if (body.isPinned !== undefined) add('isPinned', body.isPinned ? 1 : 0);
    if (body.team !== undefined) add('team', body.team ? JSON.stringify(body.team) : null);
    if (body.agency !== undefined) add('agency', body.agency ? JSON.stringify(body.agency) : null);
    if (body.lastOrder !== undefined) add('lastOrder', body.lastOrder ? JSON.stringify(body.lastOrder) : null);

    if (fields.length === 0) return handleError(res, 400, 'No updatable fields provided');

    // We need to preserve createdAt/createdBy in metadata; fetch existing metadata first
    db.get('SELECT metadata FROM patients WHERE id = ?', [id], (mErr, mRow) => {
        if (mErr) return handleError(res, 500, mErr.message || 'DB error');
        if (!mRow) return handleError(res, 404, 'Patient not found');
        let existingMeta = {};
        try { existingMeta = mRow.metadata ? JSON.parse(mRow.metadata) : {}; } catch (e) { existingMeta = {}; }

        const updatedAt = new Date().toISOString();
        const updatedBy = req.get('X-User') || 'system';
        const mergedMeta = {
            createdAt: existingMeta.createdAt || updatedAt,
            createdBy: existingMeta.createdBy || updatedBy,
            updatedAt,
            updatedBy,
        };

        // append metadata update
        add('metadata', JSON.stringify(mergedMeta));

        const sql = `UPDATE patients SET ${fields.join(', ')} WHERE id = ?`;
        db.run(sql, [...params, id], function (err) {
            if (err) return handleError(res, 500, err.message || 'DB error');
            if (this.changes === 0) return handleError(res, 404, 'Patient not found');
            db.get('SELECT * FROM patients WHERE id = ?', [id], (err2, row) => {
                if (err2) return handleError(res, 500, err2.message || 'DB error');
                res.json(rowToPatient(row));
            });
        });
    });
});

// DELETE - DELETE /api/v1/patients/:id
app.delete(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    if (!id) return handleError(res, 400, 'Invalid id');
    db.run('DELETE FROM patients WHERE id = ?', [id], function (err) {
        if (err) return handleError(res, 500, err.message || 'DB error');
        if (this.changes === 0) return handleError(res, 404, 'Patient not found');
        res.status(204).send();
    });
});

// ------------------- CRUD ROUTES (RESTful) -------------------

// CREATE - POST /users
// - expects full user object {name, email}
// - returns 201 Created, Location header and the created resource
app.post("/users", (req, res) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return handleError(res, 400, "Name and email required");
    }

    db.run(
        "INSERT INTO users (name, email) VALUES (?, ?)",
        [name, email],
        function (err) {
            if (err) {
                return handleError(res, 500, err.message || "DB error");
            }
            const created = { id: this.lastID, name, email };
            // send absolute URL in Location when possible
            const host = (req.get("X-Forwarded-Host") || req.get("host"));
            const proto = req.get("X-Forwarded-Proto") || req.protocol;
            const loc = host ? `${proto}://${host}/users/${created.id}` : `/users/${created.id}`;
            res.status(201)
                .location(loc)
                .json(created);
        }
    );
});

// READ ALL - GET /users
// - supports optional pagination via ?limit=&offset=
app.get("/users", (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    db.all(
        "SELECT * FROM users LIMIT ? OFFSET ?",
        [limit, offset],
        (err, rows) => {
            if (err) {
                return handleError(res, 500, err.message || "DB error");
            }
            res.json({
                count: rows.length,
                limit,
                offset,
                data: rows,
            });
        }
    );
});

// support HEAD for collection (Express handles HEAD automatically for GET but keep explicit if needed)
app.head('/users', (req, res) => {
    res.status(200).end();
});

// READ ONE - GET /users/:id
app.get("/users/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return handleError(res, 400, "Invalid id");

    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
        if (err) return handleError(res, 500, err.message || "DB error");
        if (!row) return handleError(res, 404, "User not found");
        res.json(row);
    });
});

// support HEAD for single resource
app.head('/users/:id', (req, res) => {
    res.status(200).end();
});

// UPDATE (idempotent, full replace) - PUT /users/:id
// - requires full resource (name and email)
// - returns 200 with updated resource
app.put("/users/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return handleError(res, 400, "Invalid id");

    const { name, email } = req.body;
    if (!name || !email) return handleError(res, 400, "Name and email required for full update");

    db.run(
        "UPDATE users SET name = ?, email = ? WHERE id = ?",
        [name, email, id],
        function (err) {
            if (err) return handleError(res, 500, err.message || "DB error");
            if (this.changes === 0) return handleError(res, 404, "User not found");

            db.get("SELECT * FROM users WHERE id = ?", [id], (err2, row) => {
                if (err2) return handleError(res, 500, err2.message || "DB error");
                res.json(row);
            });
        }
    );
});

// PARTIAL UPDATE - PATCH /users/:id
// - accepts partial resource and returns updated resource
app.patch("/users/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return handleError(res, 400, "Invalid id");

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;

    if (Object.keys(updates).length === 0) {
        return handleError(res, 400, "No updatable fields provided");
    }

    // build SET clause dynamically
    const fields = Object.keys(updates);
    const placeholders = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => updates[f]);

    const sql = `UPDATE users SET ${placeholders} WHERE id = ?`;
    db.run(sql, [...values, id], function (err) {
        if (err) return handleError(res, 500, err.message || "DB error");
        if (this.changes === 0) return handleError(res, 404, "User not found");

        db.get("SELECT * FROM users WHERE id = ?", [id], (err2, row) => {
            if (err2) return handleError(res, 500, err2.message || "DB error");
            res.json(row);
        });
    });
});

// DELETE - DELETE /users/:id
// - returns 204 No Content on success
app.delete("/users/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return handleError(res, 400, "Invalid id");

    db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
        if (err) return handleError(res, 500, err.message || "DB error");
        if (this.changes === 0) return handleError(res, 404, "User not found");

        res.status(204).end();
    });
});

// utility function to parse ID from request params
function parseId(id) {
    return id && id.trim();
}

// start server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
function shutdown() {
    console.log('Received kill signal, shutting down gracefully');
    server.close(() => {
        console.log('Closed out remaining connections');
        db.close((err) => {
            if (err) {
                console.error('Error closing database', err.message);
            } else {
                console.log('Closed the database connection');
            }
            process.exit(0);
        });
    });

    // Force close after 10s
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
