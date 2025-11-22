# Authentication Flow - Sample Requests & Responses

This document provides complete sample request/response examples for the URL Shortener authentication flow, including both normal and enterprise registration types.

## Table of Contents
1. [Anonymous User Flow](#anonymous-user-flow)
2. [Get Available Plans](#get-available-plans)
3. [Normal Registration](#normal-registration-individual)
4. [Enterprise Registration](#enterprise-registration-organization)
5. [Payment Confirmation](#payment-confirmation)
6. [Login Flow](#login-flow)
7. [User Profile & Quota](#user-profile--quota)
8. [Authenticated URL Creation](#authenticated-url-creation)
9. [Error Scenarios](#error-scenarios)

---

## Anonymous User Flow

Anonymous users can create up to 2 URLs without registration. After reaching the limit, they must register to continue.

  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "shortCode": "a1B2c3",
    "shortUrl": "http://localhost:3000/a1B2c3",
    "originalUrl": "https://example.com",
    "createdAt": "2025-11-22T01:00:00.000Z"
  },
  "message": "You have 1 URL left before registration is required"
}
```

### 2. Second URL (Last Free URL)

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://google.com"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "shortCode": "d4E5f6",
    "shortUrl": "http://localhost:3000/d4E5f6",
