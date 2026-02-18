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
    // Skip for APIC endpoints
    if (req.path.startsWith('/api/apic/')) {
        return next();
    }

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
const API_BASE = '/api';



// ------------------- ADMIN UTILITIES -------------------

// POST - APIC Token
app.post(`${API_BASE}/apic/token`, (req, res) => {
    res.json({
        "access_token": "000100tgBk8bzlyPNyFDeefcH2FP5lrET0jfSkz7Qw",
        "token_type": "Bearer",
        "expires_in": 3600
    });
});

// POST - APIC Token Validate
app.post(`${API_BASE}/apic/token/v1/validate`, (req, res) => {
    res.send("eyJraWQiOiJKVmFPb2hGMTBqbldMVmdIeXR4YU9INHdBSjEzd2xqNkVHXy1CYklESUM4IiwiYWxnIjoiUlMyNTYifQ.eyJpYXQiOjE3NzA5MDA3MTMsInN1YiI6IjExMzY5ODA1NjMwIiwicHJpdmlsZWdlcyI6IlZpZXdJdGVtRm9ybXVsYXJ5RmxhZyxFZGl0UGF0aWVudCxDdXN0b21lclNlbGZBZG1pblZpZXcsRGlzcGxheVNoaXBtZW50Tm90aWZpY2F0aW9uLHZpZXdCYWNrT3JkZXJlZEl0ZW1zLENyZWF0ZU9yZGVyLFZpZXdOb25Gb3JtdWxhcnlJdGVtc0luQ2F0YWxvZyxWaWV3SXRlbVByaWNlLFdhcm5EZWZhdWx0SXRlbVByaWNpbmdWaWV3LEJ1ZGdldEFkbWluLEVuYWJsZVBQRERlc2lnbmF0aW9uLGFkZE9TSVByaWNlSXNzdWUsYWRkT1NJRGFtYWdlLFZpZXdJdGVtQXZhaWxhYmlsaXR5LGFkZE9TSVdyb25nSXRlbSxNYWludGFpbk9yZ0Ryb3BTaGlwcyxDcmVhdGVSZXR1cm4sQXBwbHlEcm9wU2hpcFRvT3JkZXIsY2ZhU3VwcGx5Q2hhaW4sTWFpbnRhaW5Gb3JtdWxhcnlHbG9iYWwsdHJhY2tQb2ludFBhdGllbnRDaGFyZ2VzLGFkZEFkdmFuY2VkU2VhcmNoLFZpZXdQYXRpZW50LEVkaXRDbGluaWNpYW4sc2VhcmNoT1NJTWVkbGluZSxhZGRFbWJyb2lkZXJ5LE1haW50YWluUmV2ZXJzZUZvcm11bGFyeUdsb2JhbCxhZGRPU0lTaG9ydGFnZSxBbGxvd1J1c2hGcmVpZ2h0LGFkZEl0ZW1Db252ZXJzaW9uLE5hdmlnYXRlVG9JbnNpZ2h0LFZpZXdBbGxDbGluaWNpYW5zQnlBY2NvdW50LFZpZXdJdGVtQ29udHJhY3RQcmljZUZsYWcsTmF2aWdhdGVUb0ZSQVQsY2ZhSG9tZWNhcmVHZW5lcmFsLGFkZE9TSU1lZGxpbmUsQ3JlYXRlQW5vdGhlckNsaW5pY2lhbk9yZGVyLE1hbmFnZVJlY3VycmluZ09yZGVycyxEaXNwbGF5RG93bmxvYWRGb3JtdWxhcnlMaW5rLE1hbmFnZVBpZ2d5QmFja0xhYmVscyx2aWV3SXRlbVByb2R1Y3REZXRhaWxUYWJsZSxDcmVhdGVDb25zaWdubWVudCxOYXZpZ2F0ZVRvQ0ZBLERvd25sb2FkUGF0aWVudCxTdWJtaXRPcmRlcixhZGRQcm9kQWxsb2NhdGlvbkV4cG9ydCxNYW5hZ2VDdXN0b21lckRyaXZlblJlcm91dGVSZXF1ZXN0LFZpZXdHTENvZGVzLGFkZFByb2RBbGxvY2F0aW9uTGlzdCxWaWV3UmVjdXJyaW5nT3JkZXJzLHZpZXdPcmRlckZyZWlnaHRTdGF0dXMsVmlld09yZGVycyxNYWludGFpbk9yZ1RlbXBsYXRlcyxNYWludGFpbkdMQ29kZUdsb2JhbCxVcGxvYWRQYXRpZW50LFZpZXdJbnZvaWNlcyxOYXZpZ2F0ZVRvUGFyc2NhbixGaWxlVXBsb2FkLFZpZXdDbWlyLHRyYWNrUG9pbnRFbmFibGVkLE1haW50YWluQ21pcixWaWV3UFBEQnVkZ2V0LE1hbmFnZU5vdGlmaWNhdGlvblByZWZlcmVuY2UsdHJhY2tQb2ludEludmVudG9yeU1hbmFnZW1lbnQsQ3VzdG9tZXJTZWxmQWRtaW5SdWxlLFZpZXdDbGluaWNpYW4sQ3VzdG9tZXJTZWxmQWRtaW5FZGl0LFZpZXdJdGVtQWxsb2NhdGlvblN0YXR1cyxBY2Nlc3NPcmRlcnNDcmVhdGVkQnlVc2VyLFZpZXdSZXR1cm5zLEFjY2Vzc09yZGVyc0J5QWNjb3VudEFjY2VzcyxFZGl0T3JkZXJQTyxNYW5hZ2VTaGFyZWRUZW1wbGF0ZSxCaWxsUGF5VmlldyxhZGRPU0lPdmVyYWdlLEludm9pY2VWZXJpZmllcixNYWludGFpbkZvcm11bGFyeUJ5QWNjb3VudCxWaWV3TWFza2VkRGF0YSxNYW5hZ2VFbWJyb2lkZXJ5RGlnaXRpemF0aW9uUmVxdWVzdCxISF9FRFBPLFJTX0VOTEQsQkRfTU5HRSxGTV9BQ0NUR1JQLEZSX0VOTEQsQk9fU1RBTkQsU0FfU1RBTkQsQlBfTU5HRSxGVF9FTkxELERTX01PUkQsSUFfQ1VTRCxVTV9PUlVMRSxPSF9TSElDLFNMX1NIQVJFLElDX0VOTEQsVVBfU1RBTkQsT0xfRFVJQyxDQV9FTkxELENEX1NUQU5ELElMX0ZVTEwsR0xfQUNDVEdSUCxFTF9NTkdFLElTX0VOTEQsQ01fU1RBTkQsQ09fRU5MRCxJVl9WRVJJRixDUl9NTkdFLENTX1NUQU5ELFJEX01OR0UsUENfRU5MRCxUUF9TVEFORCxQTF9FTkxELFBNX1NUQU5ELFJPX1NUQU5ELERBX0NVU1QiLCJjbGllbnRJZCI6IlBMTU9ScGowVlpDbEZiZHBhR0swQko3Ukp3SWEiLCJnaXZlbk5hbWUiOiJUZXN0IEhvbWVIZWFsdGggMSIsInVzZXJ0eXBlIjoiQ3VzdG9tZXIiLCJhY3RpdmUiOnRydWUsImludGVybmFsQXV0aGVudGljYXRpb24iOmZhbHNlLCJmYW1pbHlOYW1lIjoiVXNlciAwMSIsInNjb3BlIjoib3BlbmlkIiwibmFtZSI6IlRlc3QgSG9tZUhlYWx0aCAxIiwic2Vzc2lvblRpbWVvdXQiOjQ4MCwidG9rZW5UeXBlIjoiQmVhcmVyIiwiZXhwIjoxNzcwOTA0MzEzLCJlbWFpbCI6Imtnb3ZseHdkQG1lZGxpbmUuY29tIiwicmVwQWNjb3VudE51bWJlciI6IiIsInVzZXJuYW1lIjoiQVVUT19ISF9SVyJ9.bl2hd2OSa9JNY0LchF_l53syIi2UJqtWRyqdxLg54Ew-9UIkffnN3VOCC9Zlqsp0jFpE5oNG_lnHV-tLTJQmIaYsAfWZMisl0T-4HHzf1qWxvFptes6X53NaefSsJCeBpSXYVy6tKo47iJZDaKF2O-vF9nySpAnbywf163pEkUWAYF7ERQ8dxKHVXNbFNh14fY3bvVxSB2UsMzRAZwpAFrQVqZs2ZbRz-5rTLG2VKSWpdrn4g6j2l_jdHmuevNVWEn8GcofmdGGIToLEqbFwaOznOQ1P7HH1q47Q4b6N6PjBdHEyt1Ua5s915Wtn2NrOo4xjt8V3LKOBmabFBzm0qA");
});

// GET - Account ShipTo
app.get(`${API_BASE}/apic/ecom/account/v1/shipto/:id`, (req, res) => {
    res.json({
        "id": "1483051",
        "name": "IS ECOM ONLY HOMECARE TEST ACC",
        "shortName": "IS ECOM ONLY HOMECARE TEST ACC",
        "address": {
            "address1": "1 MEDLINE PL",
            "address2": "UPDATES APPROVED BY IS ECOM TEAM",
            "poBox": "",
            "city": "MUNDELEIN",
            "district": "",
            "state": "IL",
            "postalCode": "60060-4485",
            "country": "US",
            "gln": "0000000000000",
            "taxJurisdiction": "1409720100"
        },
        "soldTo": {
            "id": "1483051",
            "name": "IS ECOM ONLY HOMECARE TEST ACCT 1",
            "shortName": "IS ECOM ONLY HOMECARE TEST ACCT 1",
            "customerGroup": "HH",
            "enablePPDFilter": false,
            "pendingTaxCert": false,
            "creditCardRequired": false,
            "consignmentEnabled": false,
            "phdOrderingEnabled": true,
            "triageOrderingEnabled": true,
            "primeVendor": false,
            "address": {
                "address1": "1 MEDLINE PL",
                "address2": "UPDATES APPROVED BY IS ECOM TEAM",
                "poBox": "",
                "city": "MUNDELEIN",
                "district": "",
                "state": "IL",
                "postalCode": "60060-4485",
                "country": "US",
                "gln": "0000000000000",
                "taxJurisdiction": "1409720100"
            },
            "salesOffice": "HC",
            "restrictManageFormulary": false,
            "lowSlowEnabled": false,
            "partners": [
                {
                    "id": "",
                    "name": "",
                    "partnerType": "AP"
                },
                {
                    "id": "0000009995",
                    "name": "IS TEST REP",
                    "partnerType": "ZR",
                    "email": "TTestRepAcct@medline.com"
                },
                {
                    "id": "0001483051",
                    "name": "IS ECOM ONLY HOMECARE TEST ACC",
                    "partnerType": "AG",
                    "email": "JJWU@MEDLINE.COMx",
                    "formularyViewId": "ZFORM_0001483051",
                    "reverseFormularyViewId": "ZREV_0001483051"
                },
                {
                    "id": "0001483051",
                    "name": "IS ECOM ONLY HOMECARE TEST ACC",
                    "partnerType": "RE",
                    "email": "JJWU@MEDLINE.COMx"
                },
                {
                    "id": "0001483051",
                    "name": "IS ECOM ONLY HOMECARE TEST ACC",
                    "partnerType": "RG",
                    "email": "JJWU@MEDLINE.COMx"
                },
                {
                    "id": "0001483051",
                    "name": "IS ECOM ONLY HOMECARE TEST ACC",
                    "partnerType": "WE",
                    "email": "JJWU@MEDLINE.COMx"
                },
                {
                    "id": "ZY08354",
                    "name": "PROMOTIONAL TRACKING ACCOUNT",
                    "partnerType": "ZY"
                }
            ],
            "invoiceOutputEnabled": false,
            "canCreateReturn": false,
            "paymentTerms": "C030",
            "paymentTermsDescription": "Within 30 days Due net",
            "dealer": false,
            "customerFreightDefault": "C",
            "patientRoomNumberEnabled": false,
            "exclusiveFlag": false,
            "orderingNotEnabled": false
        },
        "repInfos": [
            {
                "emailAddress": "TTestRepAcct@medline.com",
                "name": "IS TEST REP",
                "type": "SALES_REP"
            }
        ],
        "dssiFlag": false
    });
});

// GET - User Context Details
app.get(`${API_BASE}/apic/ecom/user/usercontext/v2/details`, (req, res) => {
    res.json({
        "details": {
            "id": "11369805630",
            "username": "AUTO_HH_RW",
            "accountLinkedFilterEnabled": true,
            "lastName": "User 01",
            "orderOptions": {
                "reference1Enabled": true,
                "reference2Enabled": true,
                "defaultShipTo": "Branch",
                "defaultPackagedFor": "Branch"
            },
            "numberOfFacilities": 19329,
            "maxAllowedCreditCards": 10,
            "activeFacilityName": "NORTHWEST MEDICAL CENTER-AZ",
            "firstName": "Test HomeHealth 1",
            "emailAddress": "kgovlxwd@medline.com",
            "formularyFilterSettings": {
                "checkedByDefault": false,
                "enabled": true
            },
            "invoiceOrdering": "Permitted",
            "daysToSearchForRecentOrders": "1",
            "mobileTermsOfUse": true,
            "creditCardOrdering": "Permitted",
            "contactPhoneNumber": "999-866-6945",
            "sessionTimeout": 30,
            "userType": "STANDARD",
            "internalAuthentication": false
        },
        "organization": {
            "id": "245673",
            "name": "Internal Testing - Home Health",
            "orgVisibilities": [
                "CSAEnabled",
                "externalOrdering",
                "simulation"
            ]
        },
        "privileges": [
            "ViewItemFormularyFlag",
            "EditPatient",
            "CustomerSelfAdminView",
            "DisplayShipmentNotification",
            "viewBackOrderedItems",
            "CreateOrder",
            "ViewNonFormularyItemsInCatalog",
            "ViewItemPrice",
            "WarnDefaultItemPricingView",
            "BudgetAdmin",
            "EnablePPDDesignation",
            "addOSIPriceIssue",
            "addOSIDamage",
            "ViewItemAvailability",
            "addOSIWrongItem",
            "MaintainOrgDropShips",
            "CreateReturn",
            "ApplyDropShipToOrder",
            "cfaSupplyChain",
            "MaintainFormularyGlobal",
            "trackPointPatientCharges",
            "addAdvancedSearch",
            "ViewPatient",
            "EditClinician",
            "searchOSIMedline",
            "addEmbroidery",
            "MaintainReverseFormularyGlobal",
            "addOSIShortage",
            "AllowRushFreight",
            "addItemConversion",
            "NavigateToInsight",
            "ViewAllCliniciansByAccount",
            "ViewProductAlternates",
            "ViewItemContractPriceFlag",
            "NavigateToFRAT",
            "cfaHomecareGeneral",
            "addOSIMedline",
            "CreateAnotherClinicianOrder",
            "ManageRecurringOrders",
            "DisplayDownloadFormularyLink",
            "ManagePiggyBackLabels",
            "viewItemProductDetailTable",
            "CreateConsignment",
            "NavigateToCFA",
            "DownloadPatient",
            "SubmitOrder",
            "addProdAllocationExport",
            "ManageCustomerDrivenRerouteRequest",
            "ViewGLCodes",
            "addProdAllocationList",
            "ViewRecurringOrders",
            "viewOrderFreightStatus",
            "ViewOrders",
            "MaintainOrgTemplates",
            "MaintainGLCodeGlobal",
            "UploadPatient",
            "ViewInvoices",
            "NavigateToParscan",
            "FileUpload",
            "ViewCmir",
            "trackPointEnabled",
            "MaintainCmir",
            "ViewPPDBudget",
            "ManageNotificationPreference",
            "trackPointInventoryManagement",
            "CustomerSelfAdminRule",
            "ViewClinician",
            "CustomerSelfAdminEdit",
            "ViewItemAllocationStatus",
            "NavigationToXRefSearch",
            "AccessOrdersCreatedByUser",
            "ViewReturns",
            "AccessOrdersByAccountAccess",
            "EditOrderPO",
            "ManageSharedTemplate",
            "BillPayView",
            "addOSIOverage",
            "InvoiceVerifier",
            "MaintainFormularyByAccount",
            "ViewMaskedData",
            "ManageEmbroideryDigitizationRequest",
            "HH_EDPO",
            "RS_ENLD",
            "BD_MNGE",
            "FM_ACCTGRP",
            "FR_ENLD",
            "BO_STAND",
            "SA_STAND",
            "BP_MNGE",
            "FT_ENLD",
            "DS_MORD",
            "IA_CUSD",
            "UM_ORULE",
            "OH_SHIC",
            "SL_SHARE",
            "IC_ENLD",
            "UP_STAND",
            "OL_DUIC",
            "CA_ENLD",
            "CD_STAND",
            "IL_FULL",
            "GL_ACCTGRP",
            "EL_MNGE",
            "IS_ENLD",
            "CM_STAND",
            "CO_ENLD",
            "IV_VERIF",
            "CR_MNGE",
            "CS_STAND",
            "RD_MNGE",
            "PC_ENLD",
            "TP_STAND",
            "PL_ENLD",
            "PM_STAND",
            "RO_STAND",
            "DA_CUST"
        ]
    });
});

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
    const payers = [
        { payerType: 'Agency', payerDisplayName: 'Medicare' },
        { payerType: 'Insurance', payerDisplayName: 'Blue Cross' },
        { payerType: 'Agency', payerDisplayName: 'Medicaid' },
        { payerType: 'Insurance', payerDisplayName: 'Aetna' },
        { payerType: 'Self-Pay', payerDisplayName: 'Self-Pay' }
    ];
    const shipToIds = ['1563073', '1000000', '2000000'];

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

        const patientKey = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : randomUUID();
        const patientId = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
        const firstName = randomItem(firstNames);
        const lastName = randomItem(lastNames);
        const dob = randomDate(new Date(1940, 0, 1), new Date(2010, 0, 1));
        const teamName = randomItem(teams);
        const primaryPayer = randomItem(payers);
        const shipToId = randomItem(shipToIds);

        const metadata = {
            createdAt,
            createdBy: 'admin-generator',
            updatedAt: createdAt,
            updatedBy: 'admin-generator'
        };

        const sql = `INSERT INTO patients (patientKey, patientId, shipToId, firstName, lastName, dateOfBirth, teamName, primaryPayer, metadata) VALUES (?,?,?,?,?,?,?,?,?)`;
        const params = [
            patientKey,
            patientId,
            shipToId,
            firstName,
            lastName,
            dob,
            teamName,
            JSON.stringify(primaryPayer),
            JSON.stringify(metadata)
        ];

        db.run(sql, params, function (err) {
            if (!err) generated++;
            insertPatient(i + 1);
        });
    };

    insertPatient(0);
});

// ------------------- PATIENTS API (V2) -------------------

// Re-create table for V2 schema if needed (Running DROP first to ensure schema update during dev)
db.run("DROP TABLE IF EXISTS patients", [], (err) => {
    if (!err) {
        db.run(`
          CREATE TABLE IF NOT EXISTS patients (
            patientKey TEXT PRIMARY KEY,
            patientId TEXT,
            shipToId TEXT,
            firstName TEXT,
            lastName TEXT,
            dateOfBirth TEXT,
            teamName TEXT,
            primaryPayer TEXT,
            metadata TEXT
          )
        `);
    }
});

function safeParse(val) {
    if (!val) return undefined;
    try {
        return JSON.parse(val);
    } catch (e) {
        return val;
    }
}

function rowToPatient(row) {
    if (!row) return null;
    return {
        patientKey: row.patientKey,
        patientId: row.patientId,
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        teamName: row.teamName,
        primaryPayer: safeParse(row.primaryPayer)
    };
}

// Validation Helpers
const ALLOWED_SORT_FIELDS = new Set(['firstName', 'lastName', 'patientId', 'team']);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GET /api/patients/:shipToId (Search)
app.get(`${API_BASE}/patients/:shipToId`, async (req, res) => {
    await sleep(2000);
    const shipToId = req.params.shipToId;
    if (!shipToId) return handleError(res, 400, 'shipToId is required');

    const q = (req.query.q || '').trim();
    const pageNo = Math.max(1, Number(req.query.pageNo) || 1);
    const pageSize = Math.max(1, Math.min(25, Number(req.query.pageSize) || 25)); // Spec max 25

    const sortBy = req.query.sortBy || 'firstName';
    const sortDir = (req.query.sortDir || 'asc').toLowerCase();

    if (!ALLOWED_SORT_FIELDS.has(sortBy)) {
        return handleError(res, 400, "Invalid sortBy value. must be one of: firstName, lastName, patientId, team", "BAD_REQUEST",
            [{field: 'sortBy', issue: 'must be one of: firstName, lastName, patientId, team'}]);
    }

    // Map sort field to DB column
    let dbSort = 'firstName';
    if (sortBy === 'lastName') dbSort = 'lastName';
    if (sortBy === 'patientId') dbSort = 'patientId';
    if (sortBy === 'team') dbSort = 'teamName';

    const dbDir = sortDir === 'desc' ? 'DESC' : 'ASC';


    const where = [];
    const params = [];
    // Mock flexibility: Do not filter strongly by shipToId unless q parameter demands it via text
    // const where = ['shipToId = ?'];
    // const params = [shipToId];

    if (q) {
        where.push("(LOWER(firstName) LIKE ? OR LOWER(lastName) LIKE ? OR patientId LIKE ? OR LOWER(teamName) LIKE ?)");
        const likeQ = `%${q.toLowerCase()}%`;
        params.push(likeQ, likeQ, likeQ, likeQ);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    db.get(`SELECT COUNT(*) as cnt
            FROM patients ${whereClause}`, params, (err, countRow) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        const totalRecords = countRow ? countRow.cnt : 0;
        const totalPages = Math.ceil(totalRecords / pageSize);
        const offset = (pageNo - 1) * pageSize;

        const sql = `SELECT *
                     FROM patients ${whereClause}
                     ORDER BY ${dbSort} ${dbDir} LIMIT ?
                     OFFSET ?`;
        db.all(sql, [...params, pageSize, offset], (err2, rows) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            const patients = rows.map(rowToPatient);

            res.json({
                soldTo: req.query.soldTo || '1563073', // Mock value or from query
                pagination: {
                    pageNo,
                    pageSize,
                    totalRecords,
                    totalPages
                },
                patients
            });
        });
    });
});

// GET /api/patient/download/:shipToId
app.get(`${API_BASE}/patient/download/:shipToId`, (req, res) => {
    const shipToId = req.params.shipToId;
    if (!shipToId) return handleError(res, 400, 'shipToId is required');

    // Return a dummy Excel file
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="patients_${shipToId}.xlsx"`);
    res.send('Dummy Excel Content');
});

// CRUD Operations

// GET /api/patients (List)
app.get(`${API_BASE}/patients`, (req, res) => {
    const q = (req.query.q || '').trim();
    const pageNo = Math.max(1, Number(req.query.pageNo) || 1);
    const pageSize = Math.max(1, Math.min(25, Number(req.query.pageSize) || 25));
    const offset = (pageNo - 1) * pageSize;

    const where = [];
    const params = [];

    if (q) {
        where.push("(LOWER(firstName) LIKE ? OR LOWER(lastName) LIKE ? OR patientId LIKE ? OR LOWER(teamName) LIKE ?)");
        const likeQ = `%${q.toLowerCase()}%`;
        params.push(likeQ, likeQ, likeQ, likeQ);
    }

    const whereClause = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    db.get(`SELECT COUNT(*) as cnt FROM patients ${whereClause}`, params, (err, countRow) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        const totalRecords = countRow ? countRow.cnt : 0;
        const totalPages = Math.ceil(totalRecords / pageSize);

        const sql = `SELECT * FROM patients ${whereClause} LIMIT ? OFFSET ?`;
        db.all(sql, [...params, pageSize, offset], (err2, rows) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            const patients = rows.map(rowToPatient);
            res.json({
                soldTo: req.query.soldTo || 'ALL', // default for global list
                pagination: {
                    pageNo,
                    pageSize,
                    totalRecords,
                    totalPages
                },
                patients
            });
        });
    });
});

// GET /api/patients/:id (Read) -- id is patientKey
app.get(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM patients WHERE patientKey = ?', [id], (err, row) => {
        if (err) return handleError(res, 500, err.message || 'DB error');
        if (!row) return handleError(res, 404, 'Patient not found');
        res.json(rowToPatient(row));
    });
});

// POST /api/patients (Create)
app.post(`${API_BASE}/patients`, (req, res) => {
    const body = req.body || {};
    // Validation
    if (!body.firstName || !body.lastName || !body.patientId || !body.teamName || !body.dateOfBirth) {
        return handleError(res, 400, "Missing required fields: firstName, lastName, patientId, teamName, dateOfBirth");
    }

    const patientKey = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : randomUUID();
    const createdAt = new Date().toISOString();
    const metadata = { createdAt, createdBy: 'api' };
    const shipToId = body.shipToId || 'DEFAULT'; // CRUD needs shipToId to be visible in search

    const sql = `INSERT INTO patients (patientKey, patientId, shipToId, firstName, lastName, dateOfBirth, teamName, primaryPayer, metadata) VALUES (?,?,?,?,?,?,?,?,?)`;
    const params = [
        patientKey,
        body.patientId,
        shipToId,
        body.firstName,
        body.lastName,
        body.dateOfBirth,
        body.teamName,
        body.primaryPayer ? JSON.stringify(body.primaryPayer) : null,
        JSON.stringify(metadata)
    ];

    db.run(sql, params, function (err) {
        if (err) return handleError(res, 500, err.message || 'DB error');
        // Fetch back
        db.get('SELECT * FROM patients WHERE patientKey = ?', [patientKey], (err2, row) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            res.status(201).json(rowToPatient(row));
        });
    });
});

// PUT /api/patients/:id (Update)
app.put(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    const body = req.body || {};

    // Validation
    if (!body.firstName || !body.lastName || !body.patientId || !body.teamName || !body.dateOfBirth) {
        return handleError(res, 400, "Missing required fields: firstName, lastName, patientId, teamName, dateOfBirth");
    }

    const sql = `UPDATE patients SET firstName=?, lastName=?, dateOfBirth=?, teamName=?, primaryPayer=?, patientId=? WHERE patientKey = ?`;
    const params = [
        body.firstName,
        body.lastName,
        body.dateOfBirth,
        body.teamName,
        body.primaryPayer ? JSON.stringify(body.primaryPayer) : null,
        body.patientId,
        id
    ];

    db.run(sql, params, function (err) {
        if (err) return handleError(res, 500, err.message || 'DB error');
        if (this.changes === 0) return handleError(res, 404, 'Patient not found');
        db.get('SELECT * FROM patients WHERE patientKey = ?', [id], (err2, row) => {
            if (err2) return handleError(res, 500, err2.message || 'DB error');
            res.json(rowToPatient(row));
        });
    });
});

// DELETE /api/patients/:id (Delete)
app.delete(`${API_BASE}/patients/:id`, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM patients WHERE patientKey = ?', [id], function (err) {
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
