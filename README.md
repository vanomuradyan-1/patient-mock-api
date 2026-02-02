# Patient Management Mock API

A mock REST API for managing patient data, built with Express and SQLite.

## 🚀 Setup & Run

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   node index.js
   ```
   The server will start on `http://localhost:5178`.

## 🔗 Base URL
All patient endpoints are prefixed with:
`http://localhost:5178/api/v1`

---

## 📚 Endpoints

### 1. List & Search Patients
**GET** `/patients`

**Query Parameters:**
- `q`: Search keyword (matches Name, Email, Guid)
- `pageNo`: Current page number (default: 1)
- `pageSize`: Items per page (default: 25)
- `sortBy`: Field to sort by (e.g., `firstName`, `lastName`, `admissionDate`)
- `sortMethod`: Sort method (`asc` or `desc`)
- `isPinned`: Filter by pinned status (`true`/`false`)
- `status`: Filter by status (`ACTIVE`, `DISCHARGED`, `PENDING`)

**Response Structure:**
```json
{
  "data": [ ... ],
  "totalRecords": 345,
  "pageNo": 1,
  "curentPageSize": 25,
  "pagesCount": 14
}
```

**Example:**
```bash
curl "http://localhost:5178/api/v1/patients?q=abc&pageNo=1&pageSize=25&sortBy=firstName&sortMethod=asc"
```

### 2. Get Single Patient
**GET** `/patients/:id`

### 3. Create Patient
**POST** `/patients`

**Body Example:**
```json
{
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "01/12/1980",
    "email": "john.doe@example.com",
    "isPinned": true,
    "team": { "name": "West Team" },
    "insurance": { "providerName": "Blue Cross", "policyNumber": "123456" },
    "agency": { "name": "HealthCare Plus", "id": "A100" },
    "lastOrder": { "id": "ORD-2023-001", "date": "10/10/2023", "status": "PENDING" }
}
```

### 4. Update Patient (Full)
**PUT** `/patients/:id`

### 5. Update Patient (Partial)
**PATCH** `/patients/:id`

Support for new fields: `team`, `agency`, `lastOrder`, `isPinned`.

---

## ⚠️ Error Handling
Standard error response with `code`, `errorCode`, `message`.
