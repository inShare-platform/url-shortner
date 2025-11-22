# Postman Collection Guide - Auth Flow

This guide explains how to import and use the Postman collection for testing the URL Shortener authentication flow.

## Import Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select the `postman_collection.json` file from this project
4. The collection "URL Shortener - Auth Flow" will be imported

## Collection Structure

The collection includes **9 main sections**:

1. **Anonymous User Flow** - Test URL creation without registration (2 URL limit)
2. **Get Available Plans** - Retrieve subscription plans
3. **Normal Registration** - Register individual users with email
4. **Enterprise Registration** - Register organizations
5. **Payment Confirmation** - Activate subscriptions after payment
6. **Login** - Login endpoints for both user types
7. **User Profile & Quota** - Get user info and usage limits
8. **Authenticated Operations** - Create URLs as authenticated user
9. **Error Scenarios** - Test validation and error handling

## Collection Variables

The collection uses these variables (auto-populated during testing):

- `base_url` - API base URL (default: http://localhost:3000)
- `auth_token` - Authentication token (set after login/register)
- `user_id` - User ID (set after registration)
- `subscription_id` - Subscription ID (set after registration)
- `plan_id` - Plan ID (set after fetching plans)

## How to Test the Complete Flow

### Step 1: Start Your Server
```bash
npm start
```

### Step 2: Run the Collection in Order

#### A. Anonymous User Flow
1. **Create First URL (Anonymous)** ✅
   - Should succeed with warning
2. **Create Second URL (Anonymous)** ✅
   - Should succeed, warns about registration
3. **Create Third URL (Should Fail)** ❌
   - Should fail with 403, requires registration

#### B. Get Plans
4. **Get All Plans** ✅
   - Retrieves available plans
   - Auto-saves Lite plan ID

#### C. Registration
5. **Register Individual User (Lite Plan)** ✅
   - Creates user with email
   - Auto-saves: `auth_token`, `user_id`, `subscription_id`
   - Status: `pending_payment`

#### D. Payment (When implemented)
6. **Confirm Payment** ✅
   - Activates subscription
   - Status changes to: `active`

#### E. Login
7. **Login Individual User** ✅
   - Login with email/password
   - Auto-saves new token

#### F. Authenticated Operations
8. **Get User Profile** ✅
   - View user details and subscription
9. **Get User Quota** ✅
   - View URL usage limits
10. **Create URL (Authenticated)** ✅
    - Create URL as logged-in user

## Manual Configuration

If auto-population doesn't work, manually set these variables:

1. Click the collection name
2. Go to **Variables** tab
3. Set values:
   - `base_url`: Your API URL
   - `auth_token`: Token from login/register response
   - `plan_id`: Get from "Get All Plans" response

## Test Scripts

Each request includes **test scripts** that:
- ✅ Validate response status codes
- ✅ Check response structure
- ✅ Auto-save important values to variables
- ✅ Verify data integrity

View test results in the **Test Results** tab after each request.

## Using Bearer Token Authentication

Most authenticated endpoints use the collection-level Bearer token:
- Token is automatically used from `{{auth_token}}` variable
- No need to manually add Authorization header
- Updated automatically after login/registration

## Request Examples

### Normal Registration
```json
{
  "type": "normal",
  "email": "user@example.com",
  "password": "securepass123",
  "planId": "{{plan_id}}"
}
```

### Enterprise Registration
```json
{
  "type": "enterprise",
  "organizationName": "TechCorp Inc",
  "website": "https://techcorp.com",
  "password": "securepass123",
  "planId": "<enterprise-plan-id>"
}
```

### Individual Login
```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

### Enterprise Login
```json
{
  "organizationName": "TechCorp Inc",
  "password": "securepass123"
}
```

## Running Collection with Postman Runner

1. Click **Runner** button
2. Select "URL Shortener - Auth Flow" collection
