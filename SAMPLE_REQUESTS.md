# Sample API Request Bodies

This document contains sample request bodies you can use to test the URL Shortener API.

## Prerequisites

1. Make sure you've run the SQL from `database/schema.sql` in your Supabase SQL Editor
2. Start the server: `npm start`
3. The server should be running on `http://localhost:3000`

---

## 1. Basic URL Shortening (No Metadata)

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "shortCode": "a1B2c3",
    "shortUrl": "http://localhost:3000/a1B2c3",
    "originalUrl": "https://www.google.com",
    "createdAt": "2025-11-19T12:00:00.000Z"
  }
}
```

---

## 2. URL Shortening with Custom Alias

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com",
    "alias": "my-github"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "shortCode": "my-github",
    "shortUrl": "http://localhost:3000/my-github",
    "originalUrl": "https://github.com",
    "createdAt": "2025-11-19T12:00:00.000Z"
  }
}
```

---

## 3. URL Shortening with Full Metadata

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "alias": "my-video",
    "metadata": {
      "isDownloadEnable": true,
      "isScreenShotEnable": false,
      "isChatbotEnable": true,
      "isInterestForm": false,
      "isFollowUp": true,
      "isExpireTime": "2025-12-31T23:59:59Z"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "shortCode": "my-video",
    "shortUrl": "http://localhost:3000/my-video",
    "originalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "createdAt": "2025-11-19T12:00:00.000Z",
    "metadata": {
      "isDownloadEnable": true,
      "isScreenShotEnable": false,
      "isChatbotEnable": true,
      "isInterestForm": false,
      "isFollowUp": true,
      "isExpireTime": "2025-12-31T23:59:59Z"
    }
  }
}
```

---

## 4. URL Shortening with Partial Metadata

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://stackoverflow.com",
    "metadata": {
      "isDownloadEnable": true,
      "isChatbotEnable": true
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "shortCode": "x9Y8z7",
    "shortUrl": "http://localhost:3000/x9Y8z7",
    "originalUrl": "https://stackoverflow.com",
    "createdAt": "2025-11-19T12:00:00.000Z",
    "metadata": {
      "isDownloadEnable": true,
      "isScreenShotEnable": false,
      "isChatbotEnable": true,
      "isInterestForm": false,
      "isFollowUp": false,
      "isExpireTime": null
    }
  }
}
```

---

## 5. URL with Expiration Time (1 hour from now)

**Request:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/temporary-link",
    "alias": "temp-link",
    "metadata": {
      "isExpireTime": "2025-11-19T18:00:00Z"
    }
  }'
```

**Note:** Replace the date with a future date/time. Use ISO 8601 format.

---

## 6. Get URL Statistics

**Request:**
```bash
curl http://localhost:3000/api/stats/my-video
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "shortCode": "my-video",
    "originalUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "clicks": 5,
    "customAlias": true,
    "createdAt": "2025-11-19T12:00:00.000Z",
    "metadata": {
      "isDownloadEnable": true,
      "isScreenShotEnable": false,
      "isChatbotEnable": true,
      "isInterestForm": false,
      "isFollowUp": true,
      "isExpireTime": "2025-12-31T23:59:59Z"
    }
  }
}
```

---

## 7. Access Short URL (Redirect)

**Request:**
```bash
curl -L http://localhost:3000/my-video
```

This will redirect you to the original URL and increment the click count.

---

## 8. Health Check

**Request:**
```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "message": "URL Shortener API is running"
}
```

---

## Using Postman

If you prefer using Postman:

1. **Method:** POST
2. **URL:** `http://localhost:3000/api/shorten`
3. **Headers:** 
   - `Content-Type: application/json`
4. **Body (raw JSON):**
```json
{
  "url": "https://www.example.com",
  "alias": "my-link",
  "metadata": {
    "isDownloadEnable": true,
    "isScreenShotEnable": true,
    "isChatbotEnable": false,
    "isInterestForm": true,
    "isFollowUp": false,
    "isExpireTime": "2025-12-31T23:59:59Z"
  }
}
```

---

## Testing Sequence

1. **Test Health Check** - Verify server is running
2. **Create Basic Short URL** - Test without metadata
3. **Create URL with Custom Alias** - Test alias functionality
4. **Create URL with Full Metadata** - Test all metadata fields
5. **Get Statistics** - Verify metadata is returned
6. **Access Short URL** - Test redirect and click tracking
7. **Get Statistics Again** - Verify click count increased

---

## Error Scenarios

### Invalid URL
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-valid-url"}'
```

Response: `400 Bad Request`

### Duplicate Alias
```bash
# First request succeeds
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "alias": "test"}'

# Second request with same alias fails
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://another.com", "alias": "test"}'
```

Response: `409 Conflict`

### Invalid Expiration Date (Past Date)
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "metadata": {
      "isExpireTime": "2020-01-01T00:00:00Z"
    }
  }'
```

Response: `400 Bad Request - isExpireTime must be a future date`

### Accessing Expired URL
```bash
# If you access a short URL after its expiration time
curl http://localhost:3000/expired-link
```

Response: `410 Gone`
