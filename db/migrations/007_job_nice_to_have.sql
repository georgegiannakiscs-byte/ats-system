-- Optional "Nice to have" list on a job (one item per line), shown on the public job page only when filled in.
alter table jobs add column if not exists nice_to_have text not null default '';
