alter table business_blocks
add column if not exists icon_name text;

update business_blocks
set icon_name = case type
  when 'website' then 'globe'
  when 'suppliers' then 'truck'
  when 'ads' then 'megaphone'
  when 'orders' then 'package'
  when 'content' then 'pen'
  when 'finance' then 'wallet'
  when 'support' then 'headset'
  when 'operations' then 'gear'
  else 'shapes'
end
where icon_name is null;
