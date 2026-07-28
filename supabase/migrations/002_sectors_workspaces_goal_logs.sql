-- Sectors (initiatives), documents, daily goal tracking, multi-user workspaces

create table if not exists goal_progress_logs (
  id text primary key,
  goal_id text not null,
  logged_on date not null,
  document jsonb not null
);

create index if not exists goal_progress_logs_goal_date
  on goal_progress_logs (goal_id, logged_on desc);

create table if not exists workspaces (
  id text primary key,
  document jsonb not null
);

create table if not exists workspace_members (
  id text primary key,
  workspace_id text not null,
  user_id text,
  document jsonb not null
);

create index if not exists workspace_members_workspace
  on workspace_members (workspace_id);

create table if not exists workspace_invites (
  id text primary key,
  workspace_id text not null,
  document jsonb not null
);

alter table goal_progress_logs enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invites enable row level security;
