#!/bin/sh
# Runs once, when the database volume is first created.
# lfl_api: the Node service's login, subject to row-level security.
# supabase_auth_admin: Supabase Auth's login; it owns the auth schema.
set -eu
psql -v ON_ERROR_STOP=1 --username postgres --dbname lfl <<SQL
create role lfl_api login password '${API_DB_PASSWORD}';
create role supabase_auth_admin login createrole password '${AUTH_DB_PASSWORD}';
create schema auth authorization supabase_auth_admin;
-- Roles some Supabase Auth migrations grant to.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
SQL
