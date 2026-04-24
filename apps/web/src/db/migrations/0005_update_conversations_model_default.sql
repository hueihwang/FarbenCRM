-- Update the default model identifier on `conversations.model` from the
-- legacy OpenRouter-prefixed string to the bare Anthropic model ID, which is
-- what the app now sends to api.anthropic.com directly.
--
-- Note: this only changes the DEFAULT for NEW rows. Existing conversations
-- keep their stored model value (most of them were also "anthropic/claude-sonnet-4",
-- but we intentionally don't touch stored data — those rows are fully owned
-- by the user and won't be used as Anthropic model IDs without first going
-- through getAIConfig() which falls back to a valid default if an unknown
-- model ID is stored).

ALTER TABLE "conversations"
  ALTER COLUMN "model" SET DEFAULT 'claude-sonnet-4-20250514';
