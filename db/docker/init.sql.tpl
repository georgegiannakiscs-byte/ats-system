-- Creates the non-superuser application owner (superusers would bypass Row Level Security).
create user deceler with password :'app_password' createrole;
create database deceler owner deceler;
