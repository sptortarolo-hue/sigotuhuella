-- Backfill: agrega el texto del comentario a los eventos de timeline
-- (ig_comment_received / fb_comment_received) que ya existían antes de que
-- el payload incluyera el campo text.
--
-- Ejecutar una sola vez en el VPS:
--   psql -U sigotuhuella -h localhost -d sigotuhuella -f backfill_comment_events.sql

-- Instagram: matchea el evento con el comentario del mismo usuario del mismo pet,
-- priorizando el comentario más cercano en el tiempo (ventana de 15 min).
UPDATE case_events ce
SET payload = jsonb_set(
  ce.payload,
  '{text}',
  to_jsonb(
    COALESCE(
      (
        SELECT ic.text
        FROM instagram_comments ic
        JOIN instagram_posts ip ON ip.id = ic.ig_post_id
        JOIN pet_cases pc ON pc.pet_id = ip.pet_id
        WHERE pc.id = ce.case_id
          AND ic.username = COALESCE(ce.payload->>'username', '')
          AND ce.payload->>'text' IS NULL
          AND ABS(EXTRACT(EPOCH FROM (ic.created_at - ce.created_at))) <= 900
        ORDER BY ABS(EXTRACT(EPOCH FROM (ic.created_at - ce.created_at)))
        LIMIT 1
      ),
      (
        SELECT ic.text
        FROM instagram_comments ic
        JOIN instagram_posts ip ON ip.id = ic.ig_post_id
        JOIN pet_cases pc ON pc.pet_id = ip.pet_id
        WHERE pc.id = ce.case_id
          AND ic.username = COALESCE(ce.payload->>'username', '')
          AND ce.payload->>'text' IS NULL
        ORDER BY ic.created_at DESC
        LIMIT 1
      ),
      ''
    )
  )
)
WHERE ce.event_type = 'ig_comment_received'
  AND ce.payload->>'text' IS NULL;

-- Facebook: matchea el evento con el comentario del mismo autor del mismo pet,
-- priorizando el comentario más cercano en el tiempo (ventana de 15 min).
UPDATE case_events ce
SET payload = jsonb_set(
  ce.payload,
  '{text}',
  to_jsonb(
    COALESCE(
      (
        SELECT fc.text
        FROM facebook_page_comments fc
        JOIN facebook_page_posts fp ON fp.id = fc.page_post_id
        JOIN pet_cases pc ON pc.pet_id = fp.pet_id
        WHERE pc.id = ce.case_id
          AND fc.author_name = COALESCE(ce.payload->>'author_name', '')
          AND ce.payload->>'text' IS NULL
          AND ABS(EXTRACT(EPOCH FROM (fc.posted_at - ce.created_at))) <= 900
        ORDER BY ABS(EXTRACT(EPOCH FROM (fc.posted_at - ce.created_at)))
        LIMIT 1
      ),
      (
        SELECT fc.text
        FROM facebook_page_comments fc
        JOIN facebook_page_posts fp ON fp.id = fc.page_post_id
        JOIN pet_cases pc ON pc.pet_id = fp.pet_id
        WHERE pc.id = ce.case_id
          AND fc.author_name = COALESCE(ce.payload->>'author_name', '')
          AND ce.payload->>'text' IS NULL
        ORDER BY fc.posted_at DESC
        LIMIT 1
      ),
      ''
    )
  )
)
WHERE ce.event_type = 'fb_comment_received'
  AND ce.payload->>'text' IS NULL;
