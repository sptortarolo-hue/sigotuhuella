-- One-shot migration: set notification_preference = 'both' for all users with phone
UPDATE users
SET notification_preference = 'both'
WHERE phone IS NOT NULL AND phone != ''
  AND (notification_preference IS NULL OR notification_preference = '' OR notification_preference = 'email');
