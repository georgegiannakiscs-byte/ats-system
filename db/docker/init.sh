#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 -U postgres -v app_password="$APP_DB_PASSWORD" -f /docker-entrypoint-initdb.d/init.sql.tpl
