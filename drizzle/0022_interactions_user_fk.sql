DELETE FROM interactions WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
ALTER TABLE interactions ADD CONSTRAINT interactions_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
