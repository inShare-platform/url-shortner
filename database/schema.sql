-- Create the urls table in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'individual', -- 'individual' or 'enterprise'
  organization_name TEXT UNIQUE,
  website TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#007bff',
  secondary_color TEXT DEFAULT '#6c757d',
  account_status TEXT NOT NULL DEFAULT 'pending_payment', -- 'pending_payment', 'active', 'suspended'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT check_user_type CHECK (user_type IN ('individual', 'enterprise')),
  CONSTRAINT check_account_status CHECK (account_status IN ('pending_payment', 'active', 'suspended')),
  CONSTRAINT check_individual_has_email CHECK (user_type != 'individual' OR email IS NOT NULL),
  CONSTRAINT check_enterprise_has_org CHECK (user_type != 'enterprise' OR organization_name IS NOT NULL)
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  url_limit INTEGER, -- NULL means unlimited
  price DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_by_user_id UUID REFERENCES users(id),
  features JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert default plans
INSERT INTO plans (name, display_name, description, url_limit, price) VALUES
  ('free', 'Free', 'Free plan for anonymous users', 2, 0),
  ('lite', 'Lite', 'Perfect for individuals', 10, 9.99),
  ('pro', 'Pro', 'For power users', 50, 29.99),
  ('enterprise', 'Enterprise', 'Unlimited URLs for organizations', NULL, 99.99),
  ('custom', 'Custom', 'Customizable plan', 100, 0)
ON CONFLICT (name) DO NOTHING;

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_payment', -- 'pending_payment', 'active', 'cancelled', 'expired'
  payment_id TEXT,
  payment_status TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT check_subscription_status CHECK (status IN ('pending_payment', 'active', 'cancelled', 'expired')),
  UNIQUE(user_id, plan_id, status)
);

-- Updated urls table with new columns
CREATE TABLE IF NOT EXISTS urls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  custom_alias BOOLEAN DEFAULT false,
  clicks INTEGER DEFAULT 0,
  ip_address TEXT, -- For anonymous users
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- For registered users
  plan_id UUID REFERENCES plans(id),
  url_type TEXT DEFAULT 'standard', -- standard, custom, premium, file
  expiry_time TIMESTAMP WITH TIME ZONE,
  is_password_protected BOOLEAN DEFAULT false,
  password_hash TEXT,
  file_type TEXT, -- MIME type for uploaded files
  file_size BIGINT, -- File size in bytes
  r2_bucket TEXT, -- R2 bucket name
  r2_key TEXT, -- R2 object key
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create the url_metadata table to store additional configuration
CREATE TABLE IF NOT EXISTS url_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url_id UUID NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  is_download_enable BOOLEAN DEFAULT false,
  is_screenshot_enable BOOLEAN DEFAULT false,
  is_chatbot_enable BOOLEAN DEFAULT false,
  is_interest_form BOOLEAN DEFAULT false,
  is_follow_up BOOLEAN DEFAULT false,
  expire_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(url_id)
);

-- Pricing table for feature-based pricing
CREATE TABLE IF NOT EXISTS pricing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name TEXT NOT NULL,
  feature_key TEXT UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert sample pricing data
INSERT INTO pricing (feature_name, feature_key, description, price) VALUES
  ('URL Shortening - 10 URLs', 'url_10', '10 URL shortenings per month', 1.00),
  ('URL Shortening - 50 URLs', 'url_50', '50 URL shortenings per month', 5.00),
  ('URL Shortening - Unlimited', 'url_unlimited', 'Unlimited URL shortenings', 20.00),
  ('Interest Form', 'interest_form', 'Enable interest form feature', 2.00),
  ('Chatbot', 'chatbot', 'Enable chatbot feature', 3.00),
  ('Screenshot', 'screenshot', 'Enable screenshot feature', 1.50),
  ('Download Enable', 'download_enable', 'Enable file downloads', 1.00),
  ('Follow Up', 'follow_up', 'Enable follow-up feature', 2.50)
ON CONFLICT (feature_key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);
CREATE INDEX IF NOT EXISTS idx_urls_ip_address ON urls(ip_address);
CREATE INDEX IF NOT EXISTS idx_url_metadata_url_id ON url_metadata(url_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_name ON users(organization_name);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_pricing_feature_key ON pricing(feature_key);
CREATE INDEX IF NOT EXISTS idx_pricing_is_active ON pricing(is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional: Enable Row Level Security (RLS)
-- ALTER TABLE urls ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Comments for documentation
-- Enterprise billing/invoices table
CREATE TABLE IF NOT EXISTS enterprise_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_type TEXT NOT NULL DEFAULT 'monthly_usage', -- 'registration_fee', 'monthly_usage'
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
  payment_date TIMESTAMP WITH TIME ZONE,
  payment_method TEXT,
  payment_reference TEXT,
  usage_details JSONB, -- Stores breakdown of usage charges
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT check_invoice_type CHECK (invoice_type IN ('registration_fee', 'monthly_usage')),
  CONSTRAINT check_invoice_status CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'))
);

-- Usage tracking table for enterprise billing
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracking_period TIMESTAMP WITH TIME ZONE NOT NULL, -- Start of tracking period (month/day)
  urls_created INTEGER DEFAULT 0,
  files_uploaded INTEGER DEFAULT 0,
  storage_used_bytes BIGINT DEFAULT 0,
  features_used JSONB DEFAULT '{}', -- Tracks premium feature usage: {"chatbot": 10, "screenshot": 5, etc.}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, tracking_period)
);

-- Create indexes for enterprise billing
CREATE INDEX IF NOT EXISTS idx_enterprise_invoices_user_id ON enterprise_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_invoices_status ON enterprise_invoices(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_invoices_billing_period ON enterprise_invoices(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(tracking_period);

-- Triggers for updated_at on new tables
CREATE TRIGGER update_enterprise_invoices_updated_at BEFORE UPDATE ON enterprise_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_tracking_updated_at BEFORE UPDATE ON usage_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Stores user accounts - supports both individual and enterprise users';
COMMENT ON COLUMN users.user_type IS 'Type of user: individual (email-based) or enterprise (organization-based)';
COMMENT ON COLUMN users.account_status IS 'Account status: pending_payment (awaiting payment), active (paid and active), suspended (suspended by admin)';
COMMENT ON COLUMN users.organization_name IS 'Organization name for enterprise users (used for login)';
COMMENT ON COLUMN users.website IS 'Organization website for enterprise users';
COMMENT ON COLUMN users.logo_url IS 'URL to organization logo for branding';
COMMENT ON COLUMN users.primary_color IS 'Primary brand color in hex format';
COMMENT ON COLUMN users.secondary_color IS 'Secondary brand color in hex format';

COMMENT ON TABLE enterprise_invoices IS 'Tracks enterprise billing including registration fees and monthly usage charges';
COMMENT ON COLUMN enterprise_invoices.invoice_type IS 'Type of invoice: registration_fee ($10 one-time) or monthly_usage (usage-based billing)';
COMMENT ON COLUMN enterprise_invoices.usage_details IS 'JSON breakdown of charges: urls, files, storage, features';

COMMENT ON TABLE usage_tracking IS 'Tracks enterprise usage metrics for monthly billing calculations';
COMMENT ON COLUMN usage_tracking.tracking_period IS 'Start of tracking period (typically first day of month)';
COMMENT ON COLUMN usage_tracking.features_used IS 'JSON object tracking premium feature usage counts';

COMMENT ON TABLE plans IS 'Subscription plans - includes predefined and custom user-created plans';
COMMENT ON COLUMN plans.is_custom IS 'True if this is a custom plan created by a user based on pricing selections';
COMMENT ON COLUMN plans.features IS 'JSON object storing selected features for custom plans';

COMMENT ON TABLE user_subscriptions IS 'Links users to their subscription plans with payment tracking';
COMMENT ON COLUMN user_subscriptions.status IS 'Subscription status: pending_payment, active, cancelled, or expired';
COMMENT ON COLUMN user_subscriptions.payment_id IS 'External payment gateway transaction ID';

COMMENT ON TABLE pricing IS 'Feature-based pricing catalog for building custom plans';
COMMENT ON COLUMN pricing.feature_key IS 'Unique identifier for the feature (e.g., url_10, chatbot)';
