-- Create the urls table in Supabase
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS urls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  custom_alias BOOLEAN DEFAULT false,
  clicks INTEGER DEFAULT 0,
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

-- Create index on short_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);

-- Create index on created_at for potential analytics queries
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);

-- Create index on url_id for faster metadata lookups
CREATE INDEX IF NOT EXISTS idx_url_metadata_url_id ON url_metadata(url_id);

-- Optional: Enable Row Level Security (RLS)
-- ALTER TABLE urls ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy to allow public read access
-- CREATE POLICY "Allow public read access" ON urls
--   FOR SELECT
--   USING (true);

-- Optional: Create a policy to allow public insert
-- CREATE POLICY "Allow public insert" ON urls
--   FOR INSERT
--   WITH CHECK (true);
