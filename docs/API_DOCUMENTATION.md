# API Documentation

**Project**: AI Procurement Backend
**Date**: October 25, 2025
**Version**: 1.0.0
**Base URL**: `https://api.tendorai.com`
**Dev URL**: `http://localhost:5001`

---

## Table of Contents

1. [Overview](#overview)
2. [Interactive Documentation](#interactive-documentation)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Endpoints](#endpoints)
6. [Error Handling](#error-handling)
7. [Examples](#examples)
8. [Best Practices](#best-practices)

---

## Overview

The AI Procurement Backend API provides a RESTful interface for managing procurement operations, including user authentication, vendor management, quote requests, and AI-powered copier recommendations.

### Key Features

- **JWT Authentication** - Secure token-based authentication
- **Rate Limiting** - Protection against abuse and DDoS
- **Swagger Documentation** - Interactive API testing
- **Comprehensive Error Handling** - Consistent error responses
- **Input Validation** - Request validation on all endpoints
- **Logging & Monitoring** - Winston-based logging

---

## Interactive Documentation

### Swagger UI

Access interactive API documentation and test endpoints:

**Development**: http://localhost:5001/api-docs
**Production**: https://api.tendorai.com/api-docs

The Swagger UI allows you to:
- View all available endpoints
- See request/response schemas
- Test API calls directly from the browser
- View authentication requirements
- See example requests and responses

### Swagger JSON

Access the OpenAPI specification in JSON format:

**Development**: http://localhost:5001/api-docs.json
**Production**: https://api.tendorai.com/api-docs.json

Use this for:
- Importing into Postman
- Generating client libraries
- Automated testing
- Custom documentation tools

---

## Authentication

### Overview

The API uses **JWT (JSON Web Tokens)** for authentication. Tokens are valid for 30 days.

### Obtaining a Token

**User Login**:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "SecurePass123"
}
```

**Vendor Login**:
```http
POST /api/auth/vendor-login
Content-Type: application/json

{
  "email": "contact@acmecorp.com",
  "password": "SecurePass123"
}
```

**Response**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "507f1f77bcf86cd799439011",
  "role": "user",
  "name": "John Doe",
  "email": "john.doe@example.com"
}
```

### Using the Token

Include the JWT token in the Authorization header:

```http
GET /api/users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Verification

Verify if a token is still valid:

```http
GET /api/auth/verify
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**:
```json
{
  "message": "Token is valid",
  "user": {
    "userId": "507f1f77bcf86cd799439011",
    "role": "user",
    "name": "John Doe",
    "email": "john.doe@example.com"
  }
}
```

---

## Rate Limiting

The API implements comprehensive rate limiting to prevent abuse:

### General API Limit
- **Limit**: 100 requests per 15 minutes per IP
- **Applies to**: All `/api/*` endpoints
- **Headers**:
  - `RateLimit-Limit`: Maximum requests allowed
  - `RateLimit-Remaining`: Remaining requests in current window
  - `RateLimit-Reset`: Time when the limit resets (UTC)

### Authentication Limit
- **Limit**: 5 failed login attempts per hour per IP
- **Applies to**: `/api/auth/login`, `/api/auth/vendor-login`
- **Note**: Only failed attempts count toward the limit

### Account Creation Limit
- **Limit**: 3 registrations per hour per IP
- **Applies to**: `/api/auth/register`, `/api/auth/vendor-register`
- **Note**: All attempts count, successful or not

### Rate Limit Response

When rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "status": "error",
  "message": "Too many requests from this IP, please try again after 15 minutes."
}
```

---

## Endpoints

### Authentication Endpoints

#### Register User

```http
POST /api/auth/register
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123"
}
```

**Responses**:
- `201 Created`: User registered successfully
- `400 Bad Request`: User already exists or validation error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 3 registrations per hour per IP

---

#### Register Vendor

```http
POST /api/auth/vendor-register
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Acme Corp",
  "email": "contact@acmecorp.com",
  "password": "SecurePass123"
}
```

**Responses**:
- `201 Created`: Vendor registered successfully
- `400 Bad Request`: Vendor already exists or validation error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 3 registrations per hour per IP

---

#### Login User

```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "507f1f77bcf86cd799439011",
  "role": "user",
  "name": "John Doe",
  "email": "john.doe@example.com"
}
```

**Responses**:
- `200 OK`: Login successful
- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid email or password
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 5 failed attempts per hour per IP

---

#### Login Vendor

```http
POST /api/auth/vendor-login
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "contact@acmecorp.com",
  "password": "SecurePass123"
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "vendorId": "507f1f77bcf86cd799439012",
  "role": "vendor",
  "name": "Acme Corp",
  "email": "contact@acmecorp.com"
}
```

**Responses**:
- `200 OK`: Login successful
- `400 Bad Request`: Missing required fields
- `401 Unauthorized`: Invalid email or password
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Rate Limit**: 5 failed attempts per hour per IP

---

#### Verify Token

```http
GET /api/auth/verify
Authorization: Bearer {token}
```

**Success Response (200 OK)**:
```json
{
  "message": "Token is valid",
  "user": {
    "userId": "507f1f77bcf86cd799439011",
    "role": "user",
    "name": "John Doe",
    "email": "john.doe@example.com"
  }
}
```

**Responses**:
- `200 OK`: Token is valid
- `401 Unauthorized`: Token is invalid, expired, or missing

---

### Health Check Endpoints

#### Root Health Check

```http
GET /
```

**Response (200 OK)**:
```json
{
  "message": "🚀 TendorAI Backend is Running!",
  "timestamp": "2025-10-25T12:00:00.000Z",
  "status": "healthy",
  "environment": "development",
  "mongodb": "Connected"
}
```

---

#### API Health Check

```http
GET /api/health
```

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T12:00:00.000Z",
  "uptime": 12345.67
}
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "status": "error",
  "message": "Error description here"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request (validation error, missing fields) |
| 401 | Unauthorized | Authentication required or invalid token |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Common Error Messages

**Validation Errors**:
```json
{
  "status": "error",
  "message": "Missing required fields: email, password"
}
```

**Authentication Errors**:
```json
{
  "status": "error",
  "message": "Invalid email or password"
}
```

**Rate Limit Errors**:
```json
{
  "status": "error",
  "message": "Too many login attempts from this IP, please try again after an hour."
}
```

---

## Examples

### Example 1: User Registration and Login

**Step 1: Register**
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john.doe@example.com",
    "password": "SecurePass123"
  }'
```

**Response**:
```json
{
  "message": "User registered successfully"
}
```

**Step 2: Login**
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123"
  }'
```

**Response**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "507f1f77bcf86cd799439011",
  "role": "user",
  "name": "John Doe",
  "email": "john.doe@example.com"
}
```

---

### Example 2: Using Authentication Token

```bash
curl -X GET http://localhost:5001/api/users/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Example 3: Handling Rate Limits

```bash
# Check rate limit headers
curl -I http://localhost:5001/api/health
```

**Response Headers**:
```
HTTP/1.1 200 OK
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 2025-10-25T12:15:00.000Z
```

---

## Best Practices

### 1. Always Use HTTPS in Production

```javascript
// Good
const baseURL = 'https://api.tendorai.com';

// Bad (only for development)
const baseURL = 'http://api.tendorai.com';
```

### 2. Store Tokens Securely

```javascript
// Good - Use httpOnly cookies or secure storage
localStorage.setItem('token', token); // Only if necessary
sessionStorage.setItem('token', token); // Better for SPAs

// Bad - Never expose tokens in URLs
const url = `/api/profile?token=${token}`; // ❌ Don't do this
```

### 3. Handle Rate Limits Gracefully

```javascript
async function apiCall() {
  try {
    const response = await fetch('/api/endpoint');

    if (response.status === 429) {
      const resetTime = response.headers.get('RateLimit-Reset');
      console.log(`Rate limited. Retry after: ${resetTime}`);
      // Implement exponential backoff
      return;
    }

    return await response.json();
  } catch (error) {
    console.error('API error:', error);
  }
}
```

### 4. Validate Input on Client Side

```javascript
// Validate before sending
const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);
const validatePassword = (password) => password.length >= 6;

if (!validateEmail(email)) {
  // Show error to user
  return;
}

// Then send to API
await fetch('/api/auth/login', { /* ... */ });
```

### 5. Handle Errors Consistently

```javascript
async function handleAPIResponse(response) {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'An error occurred');
  }
  return await response.json();
}

try {
  const data = await handleAPIResponse(response);
  // Handle success
} catch (error) {
  // Handle error
  console.error('Error:', error.message);
}
```

### 6. Use Appropriate HTTP Methods

- `GET` - Retrieve data (idempotent)
- `POST` - Create new resources or complex operations
- `PUT` - Update existing resources (replace)
- `PATCH` - Partial update
- `DELETE` - Remove resources

### 7. Include Request ID in Logs

All requests automatically include a request ID in logs:

```javascript
// Server logs will include:
{
  requestId: 'req-abc123',
  method: 'POST',
  path: '/api/auth/login',
  statusCode: 200
}
```

### 8. Monitor Rate Limit Headers

```javascript
const checkRateLimit = (response) => {
  const limit = response.headers.get('RateLimit-Limit');
  const remaining = response.headers.get('RateLimit-Remaining');
  const reset = response.headers.get('RateLimit-Reset');

  console.log(`Rate Limit: ${remaining}/${limit} (resets at ${reset})`);

  if (remaining < 10) {
    console.warn('Approaching rate limit!');
  }
};
```

---

## Postman Collection

Import the Swagger JSON into Postman:

1. Open Postman
2. Click **Import**
3. Choose **Link**
4. Enter: `http://localhost:5001/api-docs.json`
5. Click **Continue** and **Import**

This will import all endpoints with examples and authentication.

---

## Testing with curl

### Test Health Check
```bash
curl http://localhost:5001/api/health
```

### Test Registration
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123"
  }'
```

### Test with Authentication
```bash
# Save token from login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Use token in request
curl http://localhost:5001/api/users/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

## Support

For API issues or questions:

1. Check the [Swagger UI](/api-docs) for endpoint details
2. Review this documentation
3. Check server logs for detailed error information
4. Contact API support team

---

**Last Updated**: October 25, 2025
**Maintained By**: Development Team
**Status**: ✅ Active and maintained
