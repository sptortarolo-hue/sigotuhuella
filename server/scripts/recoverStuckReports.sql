-- Recuperar reportes trabados por bug de species=NULL en rfConfirm
-- Ejecutar: psql -U sigotuhuella -d sigotuhuella -h 127.0.0.1 -f recoverStuckReports.sql

DO $$
DECLARE
  pet_id1 UUID;
  pet_id2 UUID;
  msg_id UUID;
BEGIN
  -----------------------------------------
  -- Reporte 1: 5492216126069 (perro, Sicardi)
  -----------------------------------------
  INSERT INTO pets (species, status, location, description, source_type, neighborhoods)
  VALUES (
    'dog',
    'retained',
    'calle 655, Sicardi, La Plata',
    'Encontrado en calle 655, Sicardi. Todavia esta en mi casa. Quien lo encontró: 5492216126069',
    'whatsapp',
    '["Sicardi"]'::jsonb
  ) RETURNING id INTO pet_id1;

  -- Copiar 3 imágenes
  FOR msg_id IN
    SELECT id FROM whatsapp_messages
    WHERE wa_from = '5492216126069'
      AND message_type = 'image'
      AND image_data IS NOT NULL
    ORDER BY created_at
  LOOP
    INSERT INTO pet_images (pet_id, image_data, mime_type)
    SELECT pet_id1, image_data, COALESCE(image_mime, 'image/jpeg')
    FROM whatsapp_messages WHERE id = msg_id;
  END LOOP;

  -----------------------------------------
  -- Reporte 2: 5492215701582 (cachorro, domicilio)
  -----------------------------------------
  INSERT INTO pets (species, status, location, contact_info, description, source_type, neighborhoods)
  VALUES (
    'dog',
    'retained',
    'En mi domicilio, plaza Libertad, 15 y 666, La Plata',
    '2215701582',
    'Lo encontre ayer en la plaza libertad entre las 17 y 18hs. Luego volviendo a mi casa estaba en 15y666 y de ahi me siguio a casa',
    'whatsapp',
    '[]'::jsonb
  ) RETURNING id INTO pet_id2;

  -- Copiar imagen
  INSERT INTO pet_images (pet_id, image_data, mime_type)
  SELECT pet_id2, image_data, COALESCE(image_mime, 'image/jpeg')
  FROM whatsapp_messages
  WHERE wa_from = '5492215701582'
    AND message_type = 'image'
    AND image_data IS NOT NULL
  ORDER BY created_at
  LIMIT 1;

  -- Cerrar conversaciones activas
  UPDATE whatsapp_conversations
  SET status = 'closed', flow = 'closed'
  WHERE wa_from IN ('5492216126069', '5492215701582')
    AND status = 'active';

  RAISE NOTICE 'Reportes recuperados: pet1=%, pet2=%', pet_id1, pet_id2;
END $$;
