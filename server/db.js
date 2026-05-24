import pg from 'pg';

const { Pool } = pg;

const isLocal = process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/sigotuhuella',
  ssl: (process.env.DATABASE_URL && !isLocal) ? { rejectUnauthorized: false } : false,
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
  video_data TEXT NOT NULL,
  thumbnail_data TEXT,
  style VARCHAR(50),
  duration INTEGER,
  music_track VARCHAR(255),
  voice_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
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
  ('whatsapp_greeting', '🐾 ¡Gracias por contactar a Sigo Tu Huella! ¿Qué querés reportar?\n1️⃣ Avistaje (viste una mascota)\n2️⃣ Necesita atención (mascota herida/en riesgo)\n3️⃣ Accidentada')
ON CONFLICT (key) DO NOTHING;
`;

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

export default pool;
