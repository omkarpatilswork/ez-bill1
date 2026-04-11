INSERT INTO public.expense_categories (name, description) VALUES
  ('Food & Dining', 'Restaurants, food delivery, cafes, dining out'),
  ('Petrol & Fuel', 'Fuel stations, petroleum'),
  ('Toll', 'Highway tolls, FASTag charges'),
  ('Parking', 'Parking fees'),
  ('Medical', 'Hospitals, pharmacies, clinics, doctors'),
  ('Entertainment', 'Movies, events, recreation'),
  ('Education', 'Courses, training, learning'),
  ('Subscription', 'Recurring payments like Netflix, Spotify, subscriptions')
ON CONFLICT DO NOTHING;