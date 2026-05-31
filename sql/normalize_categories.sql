-- Normalize product categories in Supabase to canonical values
-- Run this in Supabase SQL Editor as role `postgres` (or use the Node script with service role)

-- Normalize variations of "minuman"/"coffee" etc to 'kopi'
UPDATE public.products
SET category = 'kopi'
WHERE lower(category) IN ('minuman','drink','coffee','cafe');

-- Normalize variations of "makanan"/"bread" etc to 'roti'
UPDATE public.products
SET category = 'roti'
WHERE lower(category) IN ('makanan','food','bread','bakery');
