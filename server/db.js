import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/sigotuhuella',
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

ALTER TABLE collaboration_accounts ADD COLUMN IF NOT EXISTS mercadopago_link VARCHAR(500);

CREATE TABLE IF NOT EXISTS volunteer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  residence_zone VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_data TEXT,
  mime_type VARCHAR(50),
  video_url TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'manual',
  related_pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID REFERENCES pets(id) ON DELETE CASCADE,
  record_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2),
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_date DATE,
  vet_name VARCHAR(255),
  clinic_name VARCHAR(255),
  medication_name VARCHAR(255),
  dosage VARCHAR(100),
  attachment_data TEXT,
  attachment_type VARCHAR(50),
  attachment_name VARCHAR(255),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
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
