# AudioRecordingFM API Documentation

## Overview
REST API for the AudioRecordingFM radio recording system.

## Base URL
```
http://localhost:3000
```

## Authentication

Most endpoints require JWT authentication. Obtain a token via `/login` endpoint.

### Getting a Token
```bash
POST /login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Using the Token
Include the token in the `Authorization` header:
```
Authorization: Bearer <your_token>
```

Or via cookie (automatically set on login).

---

## Endpoints

### Authentication

#### POST /login
Login and obtain JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1...",
  "expiresIn": "24h"
}
```

---

#### POST /logout
Logout and clear authentication cookie.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

### Recording

#### POST /record
Start user recording (requires auth).

**Response:**
```json
{
  "message": "Recording has started."
}
```

---

#### POST /stop-record
Stop user recording (requires auth).

**Response:**
```json
{
  "message": "Recording stopped successfully"
}
```

---

### Programs

#### POST /newProgram
Add a new program schedule (requires auth).

**Request Body:**
```json
{
  "days": ["Monday", "Wednesday", "Friday"],
  "start": [9, 0],
  "end": [10, 0],
  "prog": "Morning Show"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `days` | array | Days program runs (Monday-Sunday) |
| `start` | array | [hour, minute] in 24h format |
| `end` | array | [hour, minute] in 24h format |
| `prog` | string | Program name (alphanumeric, spaces, underscores) |

**Response:**
```json
{
  "message": "program added successfully"
}
```

**Error Response (validation failed):**
```json
{
  "message": "Validation failed",
  "errors": ["Invalid days: Saturday"]
}
```

---

#### POST /deleteProgram
Delete a program (requires auth).

**Request Body:**
```json
{
  "prog": "Morning Show"
}
```

**Response:**
```json
{
  "message": "Deleted successfully"
}
```

---

### FTP Management

#### GET /ftp-manager
Renders the FTP manager UI page.

---

#### GET /sync-folders
Sync program folders with database (requires auth).

**Response:**
```json
{
  "message": "Program folders synced",
  "result": {
    "dbPrograms": ["Morning Show", "Evening Talk"],
    "ftpFolders": ["Morning Show", "Evening Talk"],
    "missingInFTP": [],
    "extraInFTP": []
  }
}
```

---

#### GET /sync-old-files
Clean up recordings older than 14 days (requires auth).

**Response:**
```json
{
  "message": "Old files cleanup complete"
}
```

---

#### GET /list-ftp-files
List all files on FTP server (requires auth).

**Response:**
```json
{
  "message": "FTP files listed",
  "files": [
    { "name": "Morning Show", "type": "d", "size": 0 },
    { "name": "recording_1.mp3", "type": "-", "size": 5242880 }
  ]
}
```

---

### System

#### GET /keepAlive
Health check endpoint.

**Response:** `200 OK`

---

#### GET /
Home page - displays recording status and list.

---

#### GET /recordedPrograms
Get list of all programs with recordings.

**Response:**
```json
{
  "listings": [
    { "program": "Morning Show", ... }
  ]
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Access denied",
  "message": "No token provided. Please login."
}
```

### 400 Bad Request
```json
{
  "message": "Validation failed",
  "errors": ["Start hour must be between 0 and 23"]
}
```

### 500 Internal Server Error
```json
{
  "error": "ServerError",
  "message": "An unexpected error occurred"
}
```

---

## WebSocket Events
None currently implemented.

---

## Notes
- All timestamps use 24-hour format internally
- Programs are scheduled based on EAT (East Africa Time, UTC+3)
- Recordings are automatically chunked and uploaded to FTP
- Temporary files older than 24 hours are automatically cleaned up