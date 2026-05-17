-- Travel is daily (mid-morning), not one-time. App normalizes travel-once → travel on read.
-- Clear old one-time fired flag so travel can nudge again.

update public.profiles
set nudges_fired = array_remove(nudges_fired, 'travel-once')
where 'travel-once' = any (nudges_fired);
