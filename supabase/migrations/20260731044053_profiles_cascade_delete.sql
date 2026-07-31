-- Fix: profiles.id -> auth.users(id) had no ON DELETE action (default NO
-- ACTION), so admin.auth.admin.deleteUser() always failed with "Database
-- error deleting user" / "update or delete on table users violates foreign
-- key constraint profiles_id_fkey on table profiles" — for every user, not
-- just edge cases, since every user has a profiles row. Every other
-- user-owned table already cascades from profiles(id), so this single
-- missing cascade blocked the whole chain at the first hop.

alter table profiles
  drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
