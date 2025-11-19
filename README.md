# inShare URL Shortener API

A Node.js REST API for shortening URLs with Supabase as the database. Supports custom aliases and click tracking.

## Features

- ✅ Shorten long URLs to compact short codes
- ✅ Custom alias support (create memorable short links)
- ✅ URL validation
- ✅ Click tracking and analytics
- ✅ **Metadata support** with configuration options
- ✅ **URL expiration** with automatic checks
- ✅ Supabase PostgreSQL database
- ✅ RESTful API design
- ✅ CORS enabled

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Libraries**: 
  - `@supabase/supabase-js` - Supabase client
  - `nanoid` - Short ID generation
  - `validator` - URL validation
  - `cors` - CORS support

## Prerequisites

- Node.js (v14 or higher)
- A Supabase account and project ([supabase.com](https://supabase.com))

## Setup Instructions

### 1. Clone or Navigate to Project

```bash
cd inShare_Shortner
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to your project settings and copy:
   - Project URL
   - Anon/Public Key
3. In the Supabase SQL Editor, run the SQL from `database/schema.sql` to create the `urls` table

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000
```

### 5. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:3000`

## API Endpoints

### 1. Shorten URL

Create a shortened URL with optional custom alias and metadata configuration.

**Endpoint:** `POST /api/shorten`

**Request Body:**
```json
{
  "url": "https://example.com/very/long/url",
  "alias": "my-link",  // Optional custom alias
  "metadata": {        // Optional metadata configuration
    "isDownloadEnable": true,
    "isScreenShotEnable": false,
    "isChatbotEnable": true,
    "isInterestForm": false,
    "isFollowUp": true,
    "isExpireTime": "2025-12-31T23:59:59Z"  // ISO 8601 format or null
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "shortCode": "my-link",
    "shortUrl": "http://localhost:3000/my-link",
    "originalUrl": "https://example.com/very/long/url",
    "createdAt": "2025-01-19T12:00:00.000Z",
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

**Error Responses:**
- `400` - Invalid URL or alias format
- `409` - Alias already exists
- `500` - Server error

### 2. Redirect to Original URL

Access a shortened URL and get redirected to the original URL.

**Endpoint:** `GET /:shortCode`

**Example:**
```
GET http://localhost:3000/my-link
```

**Response:** HTTP 302 redirect to the original URL

**Error Response:**
- `404` - Short URL not found

### 3. Get URL Statistics

Retrieve statistics for a shortened URL, including metadata if available.

**Endpoint:** `GET /api/stats/:shortCode`

**Example:**
```
GET http://localhost:3000/api/stats/my-link
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "shortCode": "my-link",
    "originalUrl": "https://example.com/very/long/url",
    "clicks": 42,
    "customAlias": true,
    "createdAt": "2025-01-19T12:00:00.000Z",
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

**Error Response:**
- `404` - Short URL not found

### 4. Health Check

Check if the API is running.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "OK",
  "message": "URL Shortener API is running"
}
```

## Usage Examples

### Using cURL

**Shorten a URL:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Shorten with custom alias:**
```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "alias": "my-link"}'
```

**Get statistics:**
```bash
curl http://localhost:3000/api/stats/my-link
```

### Using JavaScript (fetch)

```javascript
// Shorten a URL
const response = await fetch('http://localhost:3000/api/shorten', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://example.com',
    alias: 'my-link' // optional
  })
});

const data = await response.json();
console.log(data.data.shortUrl);
```

## Project Structure

```
inShare_Shortner/
├── src/
│   ├── config/
│   │   └── supabase.js          # Supabase client configuration
│   ├── controllers/
│   │   └── urlController.js     # Business logic for URL operations
│   ├── routes/
│   │   └── urlRoutes.js         # API route definitions
│   ├── utils/
│   │   └── urlValidator.js      # URL and alias validation
│   └── server.js                # Express server setup
├── database/
│   └── schema.sql               # Database schema
├── .env.example                 # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## Validation Rules

### URL Validation
- Must be a valid URL
- Must include protocol (`http://` or `https://`)

### Custom Alias Validation
- Length: 3-20 characters
- Allowed characters: alphanumeric, dashes (`-`), underscores (`_`)
- Examples: `my-link`, `custom_url`, `link2024`

## Database Schema

```sql
urls (
  id UUID PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  custom_alias BOOLEAN DEFAULT false,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP
)
```

## Error Handling

The API provides detailed error messages:

- `400 Bad Request` - Invalid input (URL format, alias format)
- `404 Not Found` - Short URL doesn't exist
- `409 Conflict` - Custom alias already taken
- `500 Internal Server Error` - Server or database error

## Development

**Run in development mode with auto-reload:**
```bash
npm run dev
```

## Security Notes

- The API uses Supabase's anon key, which is safe for client-side use
- Consider enabling Row Level Security (RLS) in Supabase for production
- Add rate limiting for production deployments
- Validate and sanitize all user inputs

## Future Enhancements

- [ ] User authentication
- [ ] Custom domains
- [ ] QR code generation
- [ ] Link expiration
- [ ] Rate limiting
- [ ] Analytics dashboard
- [ ] Bulk URL shortening

## License

ISC

## Support
