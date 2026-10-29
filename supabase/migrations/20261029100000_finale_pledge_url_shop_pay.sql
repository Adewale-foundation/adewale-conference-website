-- Payment Pages can also live at paystack.shop/pay/<slug>. Mirrors PLEDGE_URL in
-- src/lib/finale.ts. Idempotent.
alter table public.finale_settings drop constraint if exists finale_settings_pledge_url_check;
alter table public.finale_settings add constraint finale_settings_pledge_url_check
  check (pledge_url ~ '^https://(paystack\.com/pay|paystack\.shop(/pay)?)/[A-Za-z0-9_-]+$');
