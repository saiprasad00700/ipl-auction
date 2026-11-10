-- Run once in Supabase SQL Editor.
create table if not exists public.cricket_player_match_stats (
  player_id text not null,
  player_name text not null,
  season integer not null,
  match_id text not null,
  match_name text not null,
  batting_innings jsonb not null default '[]'::jsonb,
  bowling_innings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, match_id)
);
create index if not exists cricket_player_match_stats_season_idx on public.cricket_player_match_stats (season);
create index if not exists cricket_player_match_stats_player_idx on public.cricket_player_match_stats (player_id);
alter table public.cricket_player_match_stats enable row level security;
-- Intentionally no anon/authenticated policies; server service-role access only.
