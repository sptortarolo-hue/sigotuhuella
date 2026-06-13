import pg from 'pg';

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
    })
  : new Pool({
      connectionString: 'postgresql://localhost:5432/sigotuhuella',
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

ALTER TABLE pets ADD COLUMN IF NOT EXISTS age VARCHAR(50);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS size VARCHAR(20);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_vaccinated BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_sterilized BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS is_dewormed BOOLEAN DEFAULT FALSE;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS neighborhoods TEXT DEFAULT '[]';
ALTER TABLE pets ADD COLUMN IF NOT EXISTS case_number VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_pets_case_number ON pets(case_number);
ALTER TABLE pets ADD COLUMN IF NOT EXISTS instagram VARCHAR(255);

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
  ('matching_radius_km', '20'),
  ('matching_min_score', '70'),
  ('whatsapp_greeting', '🐾 ¡Gracias por contactar a Sigo Tu Huella! ¿Qué querés reportar?\n1️⃣ Avistaje (viste una mascota)\n2️⃣ Necesita atención (mascota herida/en riesgo)\n3️⃣ Accidentada'),
  ('banner_chapita_visible', 'true'),
  ('banner_chapita_price', '500'),
  ('banner_chapita_is_free', 'true'),
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
  ('fb_matching_enabled', 'false'),
  ('fb_matching_min_score', '50'),
  ('fb_image_matching_enabled', 'false'),
  ('fb_image_matching_weight', '20'),
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
  ('instagram_auto_reply_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  media_type VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
  caption TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ig_media_id VARCHAR(255),
  ig_permalink TEXT,
  error_message TEXT,
  scheduled_publish_time TIMESTAMP,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

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
  image_data TEXT NOT NULL,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
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
        ADD COLUMN IF NOT EXISTS bot_name VARCHAR(20) DEFAULT 'Tute'
    `, 'whatsapp_conversations columns');

    await migrate(client, `
      ALTER TABLE pet_images
        ADD COLUMN IF NOT EXISTS crop_x REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS crop_y REAL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS original_image_data TEXT
    `, 'pet_images crop columns');

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
      DELETE FROM instagram_posts ip
      USING (
        SELECT pet_id, MAX(created_at) as max_created
        FROM instagram_posts
        WHERE status = 'queued' AND pet_id IS NOT NULL
        GROUP BY pet_id
        HAVING COUNT(*) > 1
      ) dup
      WHERE ip.pet_id = dup.pet_id
        AND ip.status = 'queued'
        AND ip.created_at < dup.max_created
    `, 'cleanup duplicate instagram posts');

    await migrate(client, `
      DELETE FROM instagram_posts p1
      USING instagram_posts p2
      WHERE p1.pet_id = p2.pet_id
        AND p1.id <> p2.id
        AND p1.status NOT IN ('failed')
        AND p2.status NOT IN ('failed')
        AND p1.created_at < p2.created_at
    `, 'deduplicate instagram posts');

    await migrate(client, `
      ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS story_interval_minutes INTEGER
    `, 'add story_interval_minutes to promotional_videos');
    await migrate(client, `
      ALTER TABLE promotional_videos ADD COLUMN IF NOT EXISTS last_story_posted_at TIMESTAMP
    `, 'add last_story_posted_at to promotional_videos');

    console.log('Database migrations complete');
  } finally {
    client.release();
  }
}

export default pool;
