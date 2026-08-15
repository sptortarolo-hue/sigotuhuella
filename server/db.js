import pg from 'pg';
import { normalizePhone } from './services/phoneUtils.js';

const { Pool } = pg;

function parseConnectionString(url) {
  if (!url) return null;
  // postgresql://user:password@host:port/database
  const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) return null;
  const [, user, password, host, port, database] = match;
  return { user, password, host: host, port: parseInt(port, 10), database };
}

const conn = parseConnectionString(process.env.DATABASE_URL);
const isLocal = conn ? (conn.host === 'localhost' || conn.host === '127.0.0.1') : true;

const pool = conn
  ? new Pool({
      ...conn,
      ssl: !isLocal ? { rejectUnauthorized: false } : false,
      options: '-c TimeZone=America/Argentina/Buenos_Aires',
    })
  : new Pool({
      connectionString: 'postgresql://localhost:5432/sigotuhuella',
      options: '-c TimeZone=America/Argentina/Buenos_Aires',
    });

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  phone VARCHAR(100),
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) DEFAULT 'pawprint';
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_number VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS volunteer_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_areas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_pending BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preference VARCHAR(20) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_case_updates BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_notice_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS volunteer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  residence_zone VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(100),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contribution_areas JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(30) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  species VARCHAR(50) NOT NULL,
  breed VARCHAR(255),
  color VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  gender VARCHAR(20) DEFAULT 'unknown',
  description TEXT,
  location VARCHAR(500) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  contact_info VARCHAR(500),
  created_by UUID REFERENCES users(id),
  is_admin_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE pets ADD COLUMN IF NOT EXISTS contact_info_2 VARCHAR(255);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS age VARCHAR(50);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS size VARCHAR(20);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_vaccinated BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_sterilized BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_dewormed BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS neighborhoods TEXT DEFAULT '[]';
ALTER TABLE pets ADD COLUMN IF NOT EXISTS case_number VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_pets_case_number ON pets(case_number);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS instagram VARCHAR(255);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS adoption_broadcasted_at TIMESTAMP;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE pets DROP COLUMN IF EXISTS share_contact;
ALTER TABLE pets DROP COLUMN IF EXISTS share_location;
ALTER TABLE pets DROP COLUMN IF EXISTS broadcast_consent;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS privacy_notice_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS collaboration_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  bank_name VARCHAR(255) NOT NULL,
  alias VARCHAR(255),
  cbu VARCHAR(255),
  cvu VARCHAR(255),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotional_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  video_data TEXT NOT NULL DEFAULT '',
  thumbnail_data TEXT,
  style VARCHAR(50),
  duration INTEGER,
  music_track VARCHAR(255),
  voice_enabled BOOLEAN DEFAULT TRUE,
  format VARCHAR(20) DEFAULT 'vertical',
  status VARCHAR(20) DEFAULT 'generating',
  error_msg TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS format VARCHAR(20) DEFAULT 'vertical';
ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'generating';
ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS error_msg TEXT;
ALTER TABLE promotional_videos ALTER COLUMN video_data SET DEFAULT '';

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('whatsapp_enabled', 'false'),
  ('whatsapp_phone_number_id', ''),
  ('whatsapp_access_token', ''),
  ('whatsapp_verify_token', ''),
  ('whatsapp_business_phone', ''),
  ('whatsapp_broadcast_enabled', 'false'),
  ('matching_radius_km', '20'),
  ('matching_min_score', '70'),
  ('matching_weight_visual', '55'),
  ('matching_weight_distance', '15'),
  ('matching_weight_breed_color', '15'),
  ('matching_weight_text', '10'),
  ('matching_weight_recency', '5'),
  ('matching_max_candidates', '10'),
  ('whatsapp_greeting', '🐾 ¡Gracias por contactar a Sigo Tu Huella! ¿Qué querés reportar?\n1️⃣ Avistaje (viste una mascota)\n2️⃣ Necesita atención (mascota herida/en riesgo)\n3️⃣ Accidentada'),
  ('banner_chapita_visible', 'true'),
  ('banner_chapita_price', '500'),
  ('banner_chapita_is_free', 'true'),
  ('raffles_visible', 'true'),
  ('pdf_page_width', '570'),
  ('pdf_page_height', '300')
ON CONFLICT (key) DO NOTHING;



CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(20) DEFAULT 'android',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_views (
  id SERIAL PRIMARY KEY,
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  viewer_ip VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pet_views_pet_id ON pet_views(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_views_created_at ON pet_views(created_at);

ALTER TABLE pets ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS my_pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  species VARCHAR(50) NOT NULL DEFAULT 'dog',
  breed VARCHAR(255),
  color VARCHAR(255),
  gender VARCHAR(20) DEFAULT 'unknown',
  birth_date DATE,
  chip_id VARCHAR(100),
  avatar_image TEXT,
  avatar_mime_type VARCHAR(50),
  cover_image TEXT,
  cover_mime_type VARCHAR(50),
  bio TEXT,
  personality_tags JSONB DEFAULT '[]'::jsonb,
  is_vaccinated BOOLEAN DEFAULT FALSE,
  is_sterilized BOOLEAN DEFAULT FALSE,
  is_dewormed BOOLEAN DEFAULT FALSE,
  weight_kg DECIMAL(6,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_pet_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  my_pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
  caption VARCHAR(500),
  taken_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_pet_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  my_pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  next_date DATE,
  photo_id UUID REFERENCES my_pet_photos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id),
  record_type TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS my_pet_id UUID REFERENCES my_pets(id) ON DELETE SET NULL;
ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS photo_ids TEXT[] DEFAULT '{}';
ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS attachment_data TEXT;
ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50);
ALTER TABLE pet_records ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);

CREATE TABLE IF NOT EXISTS qr_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,
  share_token UUID UNIQUE NOT NULL,
  my_pet_id UUID REFERENCES my_pets(id),
  batch_id VARCHAR(50),
  assigned_at TIMESTAMP,
  notified_at TIMESTAMP,
  notification_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS qr_id UUID REFERENCES qr_identifiers(id);
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS qr_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS vet_share_token UUID;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS vet_share_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS behavior_notes TEXT;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS medical_notes TEXT;
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(100);
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS lost_report_id UUID REFERENCES pets(id);

CREATE TABLE IF NOT EXISTS qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  ip_address VARCHAR(45),
  user_agent TEXT,
  scanned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  my_pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES my_pet_events(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  photo_ids TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES monthly_contests(id) ON DELETE CASCADE,
  my_pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
  votes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contest_id, my_pet_id)
);

CREATE TABLE IF NOT EXISTS contest_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nominee_id UUID NOT NULL REFERENCES contest_nominees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(nominee_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_key VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT '🏆',
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, challenge_key)
);

CREATE TABLE IF NOT EXISTS user_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS facebook_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url TEXT UNIQUE NOT NULL,
  fb_group_id VARCHAR(255),
  page_is_member BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES facebook_groups(id) ON DELETE CASCADE,
  fb_post_id VARCHAR(255) UNIQUE NOT NULL,
  fb_post_url TEXT,
  author_name VARCHAR(255),
  content TEXT,
  image_urls TEXT[] DEFAULT '{}',
  posted_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),
  classification VARCHAR(50) DEFAULT 'unclassified',
  species VARCHAR(50),
  color VARCHAR(255),
  location_hint VARCHAR(500),
  phone VARCHAR(100),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_matched BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES facebook_posts(id) ON DELETE CASCADE,
  fb_comment_id VARCHAR(255),
  author_name VARCHAR(255),
  text TEXT,
  posted_at TIMESTAMP,
  classification VARCHAR(50) DEFAULT 'unclassified',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_page_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_comment_id VARCHAR(255) UNIQUE,
  page_post_id UUID REFERENCES facebook_page_posts(id) ON DELETE CASCADE,
  author_name VARCHAR(255),
  text TEXT,
  like_count INT DEFAULT 0,
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  score DECIMAL(5,2) DEFAULT 0,
  reasons TEXT[] DEFAULT '{}',
  method VARCHAR(50) DEFAULT 'text',
  status VARCHAR(50) DEFAULT 'pending',
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_type, source_id, target_type, target_id)
);

INSERT INTO settings (key, value) VALUES
  ('fb_scraper_token', 'sihuella-scraper-2024'),
  ('fb_scraping_enabled', 'false'),
  ('fb_polygon_vertices', '[{"lat":-34.856,"lng":-57.984},{"lat":-34.876,"lng":-57.964},{"lat":-34.891,"lng":-57.995}]'),
  ('fb_polygon_amplitude', '100'),
  ('fb_scraper_interval_hours', '6'),
  ('fb_scraper_max_posts', '50'),
  ('fb_neighborhoods', '[]'),
  ('instagram_access_token', ''),
  ('instagram_refresh_token', ''),
  ('instagram_token_expires_at', ''),
  ('instagram_user_id', ''),
  ('instagram_business_id', ''),
  ('instagram_page_name', ''),
  ('instagram_publisher_enabled', 'false'),
  ('instagram_publisher_interval', '30'),
  ('instagram_default_hashtags', '#AdoptaNoCompres #SigoTuHuella #MascotasPerdidas'),
  ('instagram_stories_enabled', 'false'),
  ('instagram_auto_reply_enabled', 'false'),
  ('facebook_page_id', ''),
  ('facebook_page_publisher_enabled', 'false'),
  ('engagement_sync_enabled', 'true'),
  ('engagement_sync_interval', '30'),
  ('facebook_publisher_interval', '30'),
  ('replica_detection_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS facebook_page_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_post_id UUID REFERENCES instagram_posts(id) ON DELETE SET NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  page_post_id VARCHAR(255),
  group_post_ids TEXT[] DEFAULT '{}',
  message TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMP;
ALTER TABLE facebook_page_posts ADD COLUMN IF NOT EXISTS is_celebration BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
  caption TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ig_media_id VARCHAR(255),
  ig_story_id VARCHAR(255),
  ig_permalink TEXT,
  error_message TEXT,
  scheduled_publish_time TIMESTAMP,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMP;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS embed_html TEXT;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS is_celebration BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_comment_id VARCHAR(255) UNIQUE NOT NULL,
  ig_media_id VARCHAR(255),
  ig_post_id UUID REFERENCES instagram_posts(id) ON DELETE SET NULL,
  username VARCHAR(255),
  text TEXT,
  replied BOOLEAN DEFAULT FALSE,
  dm_sent BOOLEAN DEFAULT FALSE,
  classification VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords TEXT[] NOT NULL,
  reply_type VARCHAR(20) NOT NULL DEFAULT 'public_reply',
  reply_template TEXT NOT NULL,
  dm_template TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  image_data TEXT,
  mime_type VARCHAR(50) DEFAULT 'image/jpeg',
  external_url TEXT,
  crop_x REAL DEFAULT 0.5,
  crop_y REAL DEFAULT 0.5,
  original_image_data TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id VARCHAR(255) UNIQUE,
  conversation_id UUID,
  wa_from VARCHAR(50) NOT NULL,
  sender_name VARCHAR(255),
  message_type VARCHAR(30) DEFAULT 'text',
  text_body TEXT,
  image_data TEXT,
  image_mime VARCHAR(50),
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  status VARCHAR(30) DEFAULT 'pending',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  direction VARCHAR(20) DEFAULT 'inbound',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_from VARCHAR(50) NOT NULL,
  bot_name VARCHAR(20) DEFAULT 'Tute',
  flow VARCHAR(50),
  flow_state JSONB DEFAULT '{}'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(30) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  group_id VARCHAR(255) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  auto_broadcast BOOLEAN DEFAULT TRUE,
  broadcast_adoptions BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_to VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fb_relay_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id),
  group_id UUID REFERENCES facebook_groups(id),
  fb_group_id VARCHAR(255),
  message TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  attempts INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pet_shares (
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) DEFAULT 'editor',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (pet_id, user_id)
);

ALTER TABLE pets ADD COLUMN IF NOT EXISTS pet_type VARCHAR(20) DEFAULT 'own';
ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS pet_type VARCHAR(20) DEFAULT 'own';

CREATE TABLE IF NOT EXISTS share_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  my_pet_id UUID REFERENCES my_pets(id) ON DELETE CASCADE,
  invited_email VARCHAR(255),
  invited_phone VARCHAR(50),
  token VARCHAR(64) UNIQUE NOT NULL,
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  reminder_count INT DEFAULT 0,
  last_reminder_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tts_usage (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) NOT NULL,
  chars_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE(month)
);

CREATE TABLE IF NOT EXISTS my_pet_shares (
  pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) DEFAULT 'editor',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (pet_id, user_id)
);

CREATE TABLE IF NOT EXISTS adoption_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  inviter_id UUID NOT NULL REFERENCES users(id),
  adopter_id UUID REFERENCES users(id),
  adopter_name VARCHAR(255) NOT NULL,
  adopter_email VARCHAR(255) NOT NULL,
  adopter_phone VARCHAR(100) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_adopter',
  qr_id UUID REFERENCES qr_identifiers(id),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  returned_at TIMESTAMP,
  return_reason TEXT
);

ALTER TABLE pets ADD COLUMN IF NOT EXISTS adoption_assignment_id UUID REFERENCES adoption_assignments(id);
ALTER TABLE adoption_assignments ALTER COLUMN adopter_email DROP NOT NULL;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS my_pet_id UUID REFERENCES my_pets(id);

ALTER TABLE pets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES pets(id) ON DELETE SET NULL;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS transit_caregiver_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS transit_assigned_at TIMESTAMP;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS transit_caregiver_name VARCHAR(255);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS transit_caregiver_phone VARCHAR(50);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS transit_caregiver_email VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_pets_group_id ON pets(group_id);

CREATE TABLE IF NOT EXISTS pet_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  description TEXT,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  related_pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pet_history_pet ON pet_history(pet_id, created_at);
`;

async function migrate(client, sql, label) {
  try {
    await client.query(sql);
  } catch (err) {
    console.warn(`[MIGRATION] ${label} skipped: ${err.message}`);
  }
}

export async function initDb() {
  const client = await pool.connect();
  try {
    // Backstop: default timezone for direct DB sessions (psql, cron).
    // ALTER DATABASE ... SET is a session-independent persistent default.
    try {
      const dbRes = await client.query('SELECT current_database() AS db');
      const dbName = dbRes.rows[0]?.db;
      if (dbName) {
        await client.query(
          `ALTER DATABASE ${JSON.stringify(dbName)} SET timezone = 'America/Argentina/Buenos_Aires'`
        );
      }
    } catch (err) {
      console.warn(`[MIGRATION] set database timezone skipped: ${err.message}`);
    }

    await client.query(schema);
    console.log('Database schema initialized');

    await migrate(client, `
      ALTER TABLE whatsapp_messages
        ADD COLUMN IF NOT EXISTS conversation_id UUID,
        ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'inbound'
    `, 'whatsapp_messages columns');

    await migrate(client, `
      ALTER TABLE whatsapp_conversations
        ADD COLUMN IF NOT EXISTS flow_state JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS flow VARCHAR(50),
        ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS bot_name VARCHAR(20) DEFAULT 'Tute',
        ADD COLUMN IF NOT EXISTS privacy_notice_at TIMESTAMP
    `, 'whatsapp_conversations columns');

    await migrate(client, `
      ALTER TABLE pet_images
        ADD COLUMN IF NOT EXISTS crop_x REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS crop_y REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS original_image_data TEXT,
        ADD COLUMN IF NOT EXISTS external_url TEXT
    `, 'pet_images crop columns');

    await migrate(client, `
      ALTER TABLE pet_images ALTER COLUMN image_data DROP NOT NULL,
                          ALTER COLUMN mime_type DROP NOT NULL
    `, 'pet_images nullable');

    await migrate(client, `
      ALTER TABLE my_pet_photos
        ADD COLUMN IF NOT EXISTS crop_x REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS crop_y REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS original_image_data TEXT
    `, 'my_pet_photos crop columns');

    await migrate(client, `
      ALTER TABLE my_pets
        ADD COLUMN IF NOT EXISTS crop_x REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS crop_y REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS original_avatar_data TEXT
    `, 'my_pets crop columns');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_from ON whatsapp_messages(wa_from)
    `, 'wa_from index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id)
    `, 'conversation_id index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_wa_from ON whatsapp_conversations(wa_from)
    `, 'conversations wa_from index');

    // Remove duplicate wa_message_id before creating unique index
    await migrate(client, `
      DELETE FROM whatsapp_messages wm1
      USING whatsapp_messages wm2
      WHERE wm1.wa_message_id = wm2.wa_message_id
        AND wm1.id <> wm2.id
        AND wm1.created_at < wm2.created_at
    `, 'deduplicate whatsapp messages');

    // Unique index for ON CONFLICT (wa_message_id) in the bot
    await migrate(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_message_id ON whatsapp_messages(wa_message_id)
    `, 'unique wa_message_id index');

    await migrate(client, `
      ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS story_interval_minutes INTEGER
    `, 'add story_interval_minutes to promotional_videos');
    await migrate(client, `
      ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS last_story_posted_at TIMESTAMP
    `, 'add last_story_posted_at to promotional_videos');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual'
    `, 'pets source_type');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS source_url TEXT
    `, 'pets source_url');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS source_facebook_post_id UUID REFERENCES facebook_posts(id)
    `, 'pets source_facebook_post_id');

    await migrate(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_comments_post_comment
      ON facebook_comments(post_id, fb_comment_id) WHERE fb_comment_id IS NOT NULL
    `, 'unique fb comment index');

    await migrate(client, `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_posts_fb_post_id
      ON facebook_posts(fb_post_id) WHERE fb_post_id IS NOT NULL
    `, 'unique fb_post_id index');

    await migrate(client, `
      ALTER TABLE facebook_groups ADD COLUMN IF NOT EXISTS fb_group_id VARCHAR(255)
    `, 'facebook_groups fb_group_id');
    await migrate(client, `
      ALTER TABLE facebook_groups ADD COLUMN IF NOT EXISTS page_is_member BOOLEAN DEFAULT FALSE
    `, 'facebook_groups page_is_member');
    await migrate(client, `
      ALTER TABLE facebook_groups ADD COLUMN IF NOT EXISTS publish_on_create BOOLEAN DEFAULT FALSE
    `, 'facebook_groups publish_on_create');
    await migrate(client, `
      ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS fb_replicated BOOLEAN DEFAULT FALSE
    `, 'instagram_posts fb_replicated');
    await migrate(client, `
      ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS ig_story_id VARCHAR(255)
    `, 'instagram_posts ig_story_id');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS facebook_embed_html TEXT
    `, 'pets facebook_embed_html');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS embed_html TEXT
    `, 'facebook_posts embed_html');

    await migrate(client, `
      ALTER TABLE pet_images ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `, 'pet_images sort_order');

    // WhatsApp Flows tables
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS whatsapp_chapita_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_from VARCHAR(20) NOT NULL,
        pet_name VARCHAR(255) NOT NULL,
        species VARCHAR(50),
        requester_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, 'whatsapp_chapita_requests');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS whatsapp_adoption_interests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wa_from VARCHAR(20) NOT NULL,
        species_preference VARCHAR(20),
        pet_id UUID REFERENCES pets(id),
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, 'whatsapp_adoption_interests');

    await migrate(client, `
      ALTER TABLE whatsapp_chapita_requests ADD COLUMN IF NOT EXISTS notes TEXT
    `, 'whatsapp_chapita_requests notes');
    await migrate(client, `
      ALTER TABLE whatsapp_chapita_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
    `, 'whatsapp_chapita_requests updated_at');
    await migrate(client, `
      ALTER TABLE whatsapp_adoption_interests ADD COLUMN IF NOT EXISTS notes TEXT
    `, 'whatsapp_adoption_interests notes');
    await migrate(client, `
      ALTER TABLE whatsapp_adoption_interests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
    `, 'whatsapp_adoption_interests updated_at');
    await migrate(client, `
      ALTER TABLE whatsapp_adoption_interests ADD COLUMN IF NOT EXISTS pet_id UUID REFERENCES pets(id)
    `, 'whatsapp_adoption_interests pet_id');

    await migrate(client, `
      ALTER TABLE relay_messages ADD COLUMN IF NOT EXISTS image_url TEXT
    `, 'relay_messages image_url');

    await migrate(client, `
      ALTER TABLE relay_messages ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'message'
    `, 'relay_messages type');

    await migrate(client, `
      ALTER TABLE relay_messages ALTER COLUMN wa_to DROP NOT NULL
    `, 'relay_messages wa_to nullable');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('wa_status_enabled', 'true') ON CONFLICT (key) DO NOTHING
    `, 'wa_status_enabled');

    await migrate(client, `
      ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS auto_broadcast BOOLEAN DEFAULT TRUE
    `, 'whatsapp_groups auto_broadcast');

    await migrate(client, `
      ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS broadcast_adoptions BOOLEAN DEFAULT FALSE
    `, 'whatsapp_groups broadcast_adoptions');

    await migrate(client, `
      ALTER TABLE qr_identifiers ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP
    `, 'qr_identifiers notified_at');

    await migrate(client, `
      ALTER TABLE qr_identifiers ADD COLUMN IF NOT EXISTS notification_status VARCHAR(20) DEFAULT 'pending'
    `, 'qr_identifiers notification_status');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('relay_admin_phone', '') ON CONFLICT (key) DO NOTHING
    `, 'relay_admin_phone');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_relay_enabled', 'false') ON CONFLICT (key) DO NOTHING
    `, 'fb_relay_enabled');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_adoption_broadcast_enabled', 'false') ON CONFLICT (key) DO NOTHING
    `, 'fb_adoption_broadcast_enabled');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('wa_adoption_broadcast_enabled', 'true') ON CONFLICT (key) DO NOTHING
    `, 'wa_adoption_broadcast_enabled');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('wa_adoption_broadcast_hours', '8,12,16,20') ON CONFLICT (key) DO NOTHING
    `, 'wa_adoption_broadcast_hours');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_adoption_broadcast_hours', '8,12,16,20') ON CONFLICT (key) DO NOTHING
    `, 'fb_adoption_broadcast_hours');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('last_wa_adoption_broadcast_hour', '-1') ON CONFLICT (key) DO NOTHING
    `, 'last_wa_adoption_broadcast_hour');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('last_fb_adoption_broadcast_hour', '-1') ON CONFLICT (key) DO NOTHING
    `, 'last_fb_adoption_broadcast_hour');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS share_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
        my_pet_id UUID REFERENCES my_pets(id) ON DELETE CASCADE,
        invited_email VARCHAR(255),
        invited_phone VARCHAR(50),
        token VARCHAR(64) UNIQUE NOT NULL,
        message TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        accepted_at TIMESTAMP,
        reminder_count INT DEFAULT 0,
        last_reminder_at TIMESTAMP
      )
    `, 'share_invites');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS my_pet_shares (
        pet_id UUID NOT NULL REFERENCES my_pets(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(10) DEFAULT 'editor',
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (pet_id, user_id)
      )
    `, 'my_pet_shares');

    await migrate(client, `
      ALTER TABLE facebook_groups ADD COLUMN IF NOT EXISTS strip_links BOOLEAN DEFAULT FALSE
    `, 'facebook_groups strip_links');

    await migrate(client, `
      ALTER TABLE fb_relay_tasks ADD COLUMN IF NOT EXISTS comment_text TEXT DEFAULT ''
    `, 'fb_relay_tasks comment_text');
    await migrate(client, `
      ALTER TABLE fb_relay_tasks ADD COLUMN IF NOT EXISTS marker VARCHAR(20) DEFAULT ''
    `, 'fb_relay_tasks marker');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_relay_comment_text', '') ON CONFLICT (key) DO NOTHING
    `, 'fb_relay_comment_text');

    await migrate(client, `
      ALTER TABLE fb_relay_tasks ADD COLUMN IF NOT EXISTS fb_post_url TEXT DEFAULT ''
    `, 'fb_relay_tasks fb_post_url');
    await migrate(client, `
      ALTER TABLE fb_relay_tasks ADD COLUMN IF NOT EXISTS action VARCHAR(20) DEFAULT 'post'
    `, 'fb_relay_tasks action');
    await migrate(client, `
      ALTER TABLE fb_relay_tasks ADD COLUMN IF NOT EXISTS target_url TEXT DEFAULT ''
    `, 'fb_relay_tasks target_url');

    await migrate(client, `
      ALTER TABLE facebook_groups ADD COLUMN IF NOT EXISTS scrape_enabled BOOLEAN DEFAULT TRUE
    `, 'facebook_groups scrape_enabled');

    // Eliminar duplicados de facebook_posts antes de agregar UNIQUE
    await client.query(`
      DELETE FROM facebook_posts a USING facebook_posts b
      WHERE a.id < b.id AND a.fb_post_id = b.fb_post_id
    `);
    await client.query(`
      ALTER TABLE facebook_posts ADD CONSTRAINT facebook_posts_fb_post_id_key UNIQUE (fb_post_id)
    `).catch(() => {}); // ignore if already exists

    await migrate(client, `
      DROP TABLE IF EXISTS family_members
    `, 'drop family_members');
    await migrate(client, `
      DROP TABLE IF EXISTS families
    `, 'drop families');

    const phoneTables = [
      { table: 'users', col: 'phone', pk: 'id' },
      { table: 'volunteer_requests', col: 'whatsapp', pk: 'id' },
      { table: 'share_invites', col: 'invited_phone', pk: 'id' },
      { table: 'my_pets', col: 'emergency_phone', pk: 'id' },
    ];

    for (const { table, col, pk } of phoneTables) {
      const { rows } = await client.query(
        `SELECT ${pk} AS id, ${col} AS phone FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`
      );
      let count = 0;
      for (const row of rows) {
        const normalized = normalizePhone(row.phone);
        if (normalized && normalized !== row.phone) {
          await client.query(
            `UPDATE ${table} SET ${col} = $1 WHERE ${pk} = $2`,
            [normalized, row.id]
          );
          count++;
        }
      }
      if (count > 0) console.log(`[MIGRATION] Normalized ${count} phones in ${table}.${col}`);
    }

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_scraper_from', '8') ON CONFLICT (key) DO NOTHING
    `, 'fb_scraper_from');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_scraper_to', '20') ON CONFLICT (key) DO NOTHING
    `, 'fb_scraper_to');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_scraper_interval', '4') ON CONFLICT (key) DO NOTHING
    `, 'fb_scraper_interval');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('fb_scraper_max_posts', '20') ON CONFLICT (key) DO NOTHING
    `, 'fb_scraper_max_posts');

    await migrate(client, `
      ALTER TABLE fb_relay_tasks
      DROP CONSTRAINT IF EXISTS fb_relay_tasks_pet_id_fkey,
      ADD CONSTRAINT fb_relay_tasks_pet_id_fkey
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    `, 'fb_relay_tasks cascade');

    await migrate(client, `
      ALTER TABLE pet_records
      DROP CONSTRAINT IF EXISTS pet_records_pet_id_fkey,
      ADD CONSTRAINT pet_records_pet_id_fkey
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    `, 'pet_records cascade');

    await migrate(client, `
      ALTER TABLE whatsapp_adoption_interests
      DROP CONSTRAINT IF EXISTS whatsapp_adoption_interests_pet_id_fkey,
      ADD CONSTRAINT whatsapp_adoption_interests_pet_id_fkey
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    `, 'whatsapp_adoption_interests cascade');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS news_publications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        news_id UUID NOT NULL REFERENCES news(id) ON DELETE CASCADE,
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'instagram_stories', 'facebook_page', 'facebook_groups', 'whatsapp', 'status')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
        platform_post_id TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, 'news_publications');
    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_news_publications_news_id ON news_publications(news_id)
    `, 'news_publications index');
    await migrate(client, `
      ALTER TABLE news_publications ADD CONSTRAINT IF NOT EXISTS news_publications_news_id_platform_key UNIQUE (news_id, platform)
    `, 'news_publications unique');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS pet_publications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'facebook_page', 'facebook_groups', 'whatsapp', 'status')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
        platform_post_id TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, 'pet_publications');
    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_pet_publications_pet_id ON pet_publications(pet_id)
    `, 'pet_publications index');
    await migrate(client, `
      ALTER TABLE pet_publications ADD CONSTRAINT IF NOT EXISTS pet_publications_pet_id_platform_key UNIQUE (pet_id, platform)
    `, 'pet_publications unique');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_primary_color', '#5A5A40') ON CONFLICT (key) DO NOTHING
    `, 'brand_primary_color');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_secondary_color', '#D48C70') ON CONFLICT (key) DO NOTHING
    `, 'brand_secondary_color');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_background_color', '#5A5A40') ON CONFLICT (key) DO NOTHING
    `, 'brand_background_color');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_logo', '') ON CONFLICT (key) DO NOTHING
    `, 'brand_logo');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_default_hashtags', '#AdoptaNoCompres #SigoTuHuella #MascotasPerdidas') ON CONFLICT (key) DO NOTHING
    `, 'brand_default_hashtags');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_signature', 'Sigo tu Huella') ON CONFLICT (key) DO NOTHING
    `, 'brand_signature');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('brand_cta_text', 'Conocé más en') ON CONFLICT (key) DO NOTHING
    `, 'brand_cta_text');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('news_auto_publish_enabled', 'true') ON CONFLICT (key) DO NOTHING
    `, 'news_auto_publish_enabled');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('news_auto_publish_platforms', '["instagram","facebook_page","facebook_groups","whatsapp","status"]') ON CONFLICT (key) DO NOTHING
    `, 'news_auto_publish_platforms');
    await migrate(client, `
      UPDATE settings SET value = '["instagram","facebook_page","facebook_groups","whatsapp","status"]' WHERE key = 'news_auto_publish_platforms' AND value NOT LIKE '%facebook_groups%'
    `, 'news_auto_publish_platforms update');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('pexels_api_key', '') ON CONFLICT (key) DO NOTHING
    `, 'pexels_api_key');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('screenshots_interval_hours', '6') ON CONFLICT (key) DO NOTHING
    `, 'screenshots_interval_hours');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('reel_enabled', 'true') ON CONFLICT (key) DO NOTHING
    `, 'reel_enabled');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('reel_interval_hours', '6') ON CONFLICT (key) DO NOTHING
    `, 'reel_interval_hours');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('reel_template_index', '0') ON CONFLICT (key) DO NOTHING
    `, 'reel_template_index');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('auto_story_enabled', 'true') ON CONFLICT (key) DO NOTHING
    `, 'auto_story_enabled');
    await migrate(client, `
      INSERT INTO settings (key, value) VALUES ('auto_reels_enabled', 'false') ON CONFLICT (key) DO NOTHING
    `, 'auto_reels_enabled');

    // Chapita QR design defaults
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_qr_size_mm', '23') ON CONFLICT (key) DO NOTHING`, 'chapita_qr_size_mm');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_qr_color', '#000000') ON CONFLICT (key) DO NOTHING`, 'chapita_qr_color');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_qr_bg', '#ffffff') ON CONFLICT (key) DO NOTHING`, 'chapita_qr_bg');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_code_font_size', '35') ON CONFLICT (key) DO NOTHING`, 'chapita_code_font_size');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_code_color', '#000000') ON CONFLICT (key) DO NOTHING`, 'chapita_code_color');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_arc_font_size', '37') ON CONFLICT (key) DO NOTHING`, 'chapita_arc_font_size');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_arc_color', '#000000') ON CONFLICT (key) DO NOTHING`, 'chapita_arc_color');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_arc_radius', '0.38') ON CONFLICT (key) DO NOTHING`, 'chapita_arc_radius');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_arc_start_deg', '200') ON CONFLICT (key) DO NOTHING`, 'chapita_arc_start_deg');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_arc_end_deg', '340') ON CONFLICT (key) DO NOTHING`, 'chapita_arc_end_deg');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_bottom_font_size', '35') ON CONFLICT (key) DO NOTHING`, 'chapita_bottom_font_size');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_bottom_color', '#000000') ON CONFLICT (key) DO NOTHING`, 'chapita_bottom_color');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_logo_scale', '0.55') ON CONFLICT (key) DO NOTHING`, 'chapita_logo_scale');
    await migrate(client, `INSERT INTO settings (key, value) VALUES ('chapita_logo_fade', '8') ON CONFLICT (key) DO NOTHING`, 'chapita_logo_fade');

    await migrate(client, `
      ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'group'
    `, 'whatsapp_groups type');

    await migrate(client, `
      ALTER TABLE news_publications DROP CONSTRAINT IF EXISTS news_publications_platform_check
    `, 'drop news_publications platform check');

    await migrate(client, `
      ALTER TABLE news_publications ADD CONSTRAINT news_publications_platform_check
        CHECK (platform IN ('instagram', 'instagram_stories', 'facebook_page', 'facebook_groups', 'whatsapp', 'status', 'whatsapp_channel'))
    `, 'add news_publications platform check');

    await migrate(client, `
      ALTER TABLE pet_publications DROP CONSTRAINT IF EXISTS pet_publications_platform_check
    `, 'drop pet_publications platform check');

    await migrate(client, `
      ALTER TABLE pet_publications ADD CONSTRAINT pet_publications_platform_check
        CHECK (platform IN ('instagram', 'facebook_page', 'facebook_groups', 'whatsapp', 'status', 'whatsapp_channel'))
    `, 'add pet_publications platform check');

    await migrate(client, `
      ALTER TABLE news ADD COLUMN IF NOT EXISTS source_url TEXT
    `, 'news source_url');

    await migrate(client, `
      ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS scrape_enabled BOOLEAN DEFAULT FALSE
    `, 'whatsapp_groups scrape_enabled');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS relay_428_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code INTEGER,
        message TEXT,
        reconnect_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'relay_428_log');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS whatsapp_scraped_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
        wa_message_id VARCHAR(255) UNIQUE NOT NULL,
        author_jid VARCHAR(255),
        author_name VARCHAR(255),
        content TEXT,
        image_data TEXT,
        image_mime VARCHAR(50),
        classification VARCHAR(50) DEFAULT 'unclassified',
        species VARCHAR(50),
        color VARCHAR(255),
        location_hint VARCHAR(500),
        phone VARCHAR(100),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        is_matched BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'whatsapp_scraped_messages');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS image_data TEXT
    `, 'facebook_posts image_data');

    await migrate(client, `
      ALTER TABLE facebook_posts
        ADD COLUMN IF NOT EXISTS animal_detected BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS animal_species VARCHAR(50),
        ADD COLUMN IF NOT EXISTS animal_confidence REAL
    `, 'facebook_posts animal_detect');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS author_phone VARCHAR(50)
    `, 'whatsapp_scraped_messages author_phone');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages
        ADD COLUMN IF NOT EXISTS animal_detected BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS animal_species VARCHAR(50),
        ADD COLUMN IF NOT EXISTS animal_confidence REAL
    `, 'whatsapp_scraped_messages animal_detect');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS whatsapp_message_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES whatsapp_scraped_messages(id) ON DELETE CASCADE,
        image_data TEXT NOT NULL,
        image_mime VARCHAR(50) DEFAULT 'image/jpeg',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'whatsapp_message_images');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(100);
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS owner_address TEXT;
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS reunited_at TIMESTAMP
    `, 'pets_owner_fields');

    // --- Embeddings (pgvector) ---
    await migrate(client, 'CREATE EXTENSION IF NOT EXISTS vector', 'pgvector extension');

    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS embedding vector(768)
    `, 'pets embedding column');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS embedding vector(768)
    `, 'fb_posts embedding column');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS embedding vector(768)
    `, 'wa_scraped embedding column');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_pets_embedding
      ON pets USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `, 'pets embedding index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_fb_posts_embedding
      ON facebook_posts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `, 'fb_posts embedding index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_wa_scraped_embedding
      ON whatsapp_scraped_messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `, 'wa_scraped embedding index');

    // --- Text embeddings (sentence-transformers, 384-dim) ---
    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS text_embedding vector(384)
    `, 'pets text_embedding column');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS text_embedding vector(384)
    `, 'fb_posts text_embedding column');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS text_embedding vector(384)
    `, 'wa_scraped text_embedding column');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_pets_text_embedding
      ON pets USING ivfflat (text_embedding vector_cosine_ops) WITH (lists = 100)
    `, 'pets text_embedding index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_fb_posts_text_embedding
      ON facebook_posts USING ivfflat (text_embedding vector_cosine_ops) WITH (lists = 100)
    `, 'fb_posts text_embedding index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_wa_scraped_text_embedding
      ON whatsapp_scraped_messages USING ivfflat (text_embedding vector_cosine_ops) WITH (lists = 100)
    `, 'wa_scraped text_embedding index');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS breed VARCHAR(255)
    `, 'fb_posts breed column');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS pet_name VARCHAR(255)
    `, 'fb_posts pet_name column');

    await migrate(client, `
      ALTER TABLE facebook_posts ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
    `, 'fb_posts gender column');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS breed VARCHAR(255)
    `, 'wa_scraped breed column');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS pet_name VARCHAR(255)
    `, 'wa_scraped pet_name column');

    await migrate(client, `
      ALTER TABLE whatsapp_scraped_messages ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
    `, 'wa_scraped gender column');

    // ─── Rifas / Sorteos ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS raffles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        modality VARCHAR(50) DEFAULT 'raffle',
        total_numbers INTEGER NOT NULL,
        price_per_number DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        draw_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, 'raffles table');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS raffle_prizes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raffle_id UUID REFERENCES raffles(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'raffle_prizes table');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS raffle_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raffle_id UUID REFERENCES raffles(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        buyer_name VARCHAR(255),
        buyer_email VARCHAR(255),
        buyer_phone VARCHAR(50),
        buyer_user_id UUID REFERENCES users(id),
        mp_payment_id VARCHAR(255),
        mp_external_reference VARCHAR(255),
        status VARCHAR(20) DEFAULT 'reserved',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(raffle_id, number)
      )
    `, 'raffle_tickets table');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS raffle_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raffle_id UUID REFERENCES raffles(id) ON DELETE CASCADE,
        ticket_id UUID REFERENCES raffle_tickets(id),
        mp_payment_id VARCHAR(255) UNIQUE,
        mp_status VARCHAR(50),
        amount DECIMAL(10,2),
        payer_email VARCHAR(255),
        raw_webhook JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'raffle_payments table');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_raffle_tickets_raffle_id
      ON raffle_tickets(raffle_id)
    `, 'raffle_tickets raffle_id index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_raffle_payments_raffle_id
      ON raffle_payments(raffle_id)
    `, 'raffle_payments raffle_id index');

    await migrate(client, `
      INSERT INTO settings (key, value) VALUES
        ('mp_access_token', ''),
        ('mp_webhook_secret', '')
      ON CONFLICT (key) DO NOTHING
    `, 'mp settings defaults');

    // ─── Columns para transferencia y carga manual ───
    await migrate(client, `
      ALTER TABLE raffle_tickets ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'mp'
    `, 'raffle_tickets payment_method column');

    await migrate(client, `
      ALTER TABLE raffle_tickets ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending_transfer'
    `, 'raffle_tickets payment_status column');

    // ─── Tabla de comprobantes ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS raffle_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        raffle_id UUID REFERENCES raffles(id) ON DELETE CASCADE,
        ticket_id UUID REFERENCES raffle_tickets(id),
        image_data TEXT,
        image_mime VARCHAR(50),
        buyer_name VARCHAR(255),
        buyer_phone VARCHAR(50),
        amount_expected DECIMAL(10,2),
        amount_received DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, 'raffle_receipts table');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_raffle_receipts_raffle_id
      ON raffle_receipts(raffle_id)
    `, 'raffle_receipts raffle_id index');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_raffle_receipts_ticket_id
      ON raffle_receipts(ticket_id)
    `, 'raffle_receipts ticket_id index');

    await migrate(client, `
      ALTER TABLE raffle_receipts ADD COLUMN IF NOT EXISTS lid_jid VARCHAR(255)
    `, 'raffle_receipts lid_jid');
    await migrate(client, `
      ALTER TABLE raffle_receipts ADD COLUMN IF NOT EXISTS push_name VARCHAR(255)
    `, 'raffle_receipts push_name');
    await migrate(client, `
      ALTER TABLE raffle_receipts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'relay'
    `, 'raffle_receipts source');

    // Fix UUID → VARCHAR for ticket_id (mp_external_reference)
    await migrate(client, `
      ALTER TABLE raffle_receipts ADD COLUMN IF NOT EXISTS ticket_group_id VARCHAR(255)
    `, 'raffle_receipts ticket_group_id');
    await migrate(client, `
      ALTER TABLE raffle_receipts ALTER COLUMN ticket_id DROP NOT NULL
    `, 'raffle_receipts ticket_id nullable');

    // Add telegram_id for potential future use
    await migrate(client, `
      ALTER TABLE raffle_receipts ADD COLUMN IF NOT EXISTS raffle_ticket_id UUID REFERENCES raffle_tickets(id)
    `, 'raffle_receipts raffle_ticket_id');

    await migrate(client, `
      CREATE INDEX IF NOT EXISTS idx_raffle_receipts_ticket_group_id
      ON raffle_receipts(ticket_group_id)
    `, 'raffle_receipts ticket_group_id index');

    // ─── Adoption Assignments ───
    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS adoption_assignment_id UUID REFERENCES adoption_assignments(id)
    `, 'pets adoption_assignment_id');
    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP
    `, 'pets trial_started_at');
    await migrate(client, `
      ALTER TABLE pets ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP
    `, 'pets trial_ends_at');

    // ─── my_pets QR public profile visibility + contact ───
    await migrate(client, `
      ALTER TABLE my_pets
        ADD COLUMN IF NOT EXISTS show_bio_on_qr BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_tags_on_qr BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_health_on_qr BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_behavior_on_qr BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_medical_on_qr BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS qr_contact_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS qr_contact_phone VARCHAR(100)
    `, 'my_pets qr visibility + contact');

    // ─── my_pets transferred (adopción confirmada: ocultar del portal del dueño anterior) ───
    await migrate(client, `
      ALTER TABLE my_pets ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP
    `, 'my_pets transferred_at');
    await migrate(client, `
      UPDATE my_pets mp
      SET transferred_at = NOW()
      WHERE mp.transferred_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM adoption_assignments aa
          JOIN pets p ON p.id = aa.pet_id
          WHERE aa.status = 'completed'
            AND aa.inviter_id = mp.user_id
            AND p.name = mp.name
            AND p.species = mp.species
        )
    `, 'my_pets backfill transferred_at para adopciones completadas');

    // Fix: mark tickets as paid if receipt is already confirmed (admin manual assign bug)
    await migrate(client, `
      UPDATE raffle_tickets t
      SET status = 'paid', payment_status = 'paid', paid_at = NOW()
      WHERE t.status IN ('pending_transfer', 'pending_manual')
        AND EXISTS (
          SELECT 1 FROM raffle_receipts r
          WHERE r.ticket_group_id = t.mp_external_reference
            AND r.raffle_id = t.raffle_id
            AND r.status = 'confirmed'
        )
    `, 'raffle_tickets fix stuck pending with confirmed receipt');

    // Track which channel was used for chapita QR notifications
    await migrate(client, `
      ALTER TABLE qr_identifiers ADD COLUMN IF NOT EXISTS notification_channel VARCHAR(20)
    `, 'qr_identifiers notification_channel');

    // Content moderation: user reports for feed posts/comments and pet avisos
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS content_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'comment', 'pet')),
        target_id UUID NOT NULL,
        reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reason VARCHAR(60) NOT NULL,
        description TEXT,
        status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS content_reports_pending_unique
        ON content_reports (target_type, target_id, reporter_id) WHERE status = 'pending';
    `, 'content_reports');

    // User blocking: hide content and interactions from blocked users
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS user_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(blocker_id, blocked_id)
      );
    `, 'user_blocks');

    // ─── Pet cases (trazabilidad: perdidas/encontradas/adopcion) ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS pet_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reporter_source VARCHAR(30) DEFAULT 'app',
        type VARCHAR(20) NOT NULL CHECK (type IN ('lost','found')),
        status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pet_cases_pet ON pet_cases(pet_id);
      CREATE INDEX IF NOT EXISTS idx_pet_cases_reporter ON pet_cases(reporter_id);
    `, 'pet_cases');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS case_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, created_at);
    `, 'case_events');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS facebook_replicas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fb_post_id UUID NOT NULL UNIQUE REFERENCES facebook_posts(id) ON DELETE CASCADE,
        pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
        case_id UUID REFERENCES pet_cases(id) ON DELETE CASCADE,
        method VARCHAR(20) NOT NULL CHECK (method IN ('sth','pet_url')),
        group_id UUID REFERENCES facebook_groups(id) ON DELETE SET NULL,
        group_name VARCHAR(255),
        fb_post_url TEXT,
        detected_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(fb_post_id, case_id)
      );
      CREATE INDEX IF NOT EXISTS idx_facebook_replicas_case ON facebook_replicas(case_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_replicas_group ON facebook_replicas(group_id);
      ALTER TABLE facebook_replicas DROP CONSTRAINT IF EXISTS facebook_replicas_method_check;
      ALTER TABLE facebook_replicas ADD CONSTRAINT facebook_replicas_method_check CHECK (method IN ('sth','pet_url'));
    `, 'facebook_replicas');

    // ─── Case sightings + search areas (Sprint 2: avistamientos colaborativos) ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS case_sightings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        reporter_name VARCHAR(100) NOT NULL,
        reporter_whatsapp VARCHAR(50),
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        description TEXT,
        photo_data TEXT,
        photo_mime VARCHAR(50),
        hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_case_sightings_case ON case_sightings(case_id, created_at);
    `, 'case_sightings');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS case_search_areas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        area_geojson JSONB NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_case_search_areas_case ON case_search_areas(case_id, created_at);
    `, 'case_search_areas');

    // ─── Sprint 3: alertas vecinales ───
    await migrate(client, `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhoods JSONB DEFAULT '[]'::jsonb
    `, 'users neighborhoods');

    await migrate(client, `
      CREATE TABLE IF NOT EXISTS neighborhood_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        neighborhoods TEXT[] DEFAULT '{}',
        recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        radius_km INT DEFAULT 5,
        status VARCHAR(20) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_neighborhood_alerts_case ON neighborhood_alerts(case_id, created_at);
    `, 'neighborhood_alerts');

    // ─── Sprint MM-B: seguidores de casos ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS case_followers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(case_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_case_followers_user ON case_followers(user_id, created_at);
    `, 'case_followers');

    // ─── Sprint MM-C: expiración/renovación de casos ───
    await migrate(client, `
      ALTER TABLE pet_cases ADD COLUMN IF NOT EXISTS active_until TIMESTAMP
    `, 'pet_cases active_until');
    await migrate(client, `
      UPDATE pet_cases SET active_until = created_at + INTERVAL '45 days' WHERE active_until IS NULL
    `, 'pet_cases active_until backfill');

    // ─── Sprint MM-D: lista negra comunitaria de teléfonos ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS phone_blacklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) NOT NULL,
        reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
        context_type VARCHAR(20),
        context_id UUID,
        reason TEXT,
        status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_phone_blacklist_phone ON phone_blacklist(phone);
    `, 'phone_blacklist');

    // ─── Raffle draw results + video ───
    await migrate(client, `
      ALTER TABLE raffles ADD COLUMN IF NOT EXISTS draw_results JSONB;
    `, 'raffles draw_results');
    await migrate(client, `
      ALTER TABLE raffles ADD COLUMN IF NOT EXISTS draw_video_url TEXT;
    `, 'raffles draw_video_url');

    // ─── Pet duplicate matching (pet↔pet) ───
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS pet_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        target_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        score INT NOT NULL,
        visual_score INT,
        text_score INT,
        distance_km FLOAT,
        status VARCHAR(20) DEFAULT 'pending',
        new_event_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(source_pet_id, target_pet_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pet_matches_target ON pet_matches(target_pet_id, status);
      CREATE INDEX IF NOT EXISTS idx_pet_matches_source ON pet_matches(source_pet_id, status);
    `, 'pet_matches');

    // Guarda qué se migró para poder desagrupar exacto
    await migrate(client, `
      CREATE TABLE IF NOT EXISTS pet_group_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        root_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        member_pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
        root_case_id UUID NOT NULL REFERENCES pet_cases(id) ON DELETE CASCADE,
        member_case_id UUID,
        member_case_number VARCHAR(20),
        grouped_by UUID REFERENCES users(id) ON DELETE SET NULL,
        grouped_at TIMESTAMP DEFAULT NOW(),
        migrated_sighting_ids UUID[] DEFAULT '{}',
        migrated_search_area_ids UUID[] DEFAULT '{}',
        migrated_follower_ids UUID[] DEFAULT '{}',
        migrated_ig_post_ids UUID[] DEFAULT '{}',
        migrated_fb_post_ids UUID[] DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_pet_group_history_root ON pet_group_history(root_pet_id);
      CREATE INDEX IF NOT EXISTS idx_pet_group_history_member ON pet_group_history(member_pet_id);
    `, 'pet_group_history');

    console.log('Database migrations complete');
  } finally {
    client.release();
  }
}

export default pool;
