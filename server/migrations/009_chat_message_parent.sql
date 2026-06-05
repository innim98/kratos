ALTER TABLE chat_messages ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES chat_messages(id);
