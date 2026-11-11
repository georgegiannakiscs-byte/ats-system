-- Product renamed to Ulysse. Updates the default platform name only if it was never customised.
update platform_settings
set value = jsonb_set(value, '{platformName}', '"Ulysse"')
where key = 'general' and value->>'platformName' = 'Déceler';
