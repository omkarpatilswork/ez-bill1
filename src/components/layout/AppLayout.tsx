import { Outlet } from 'react-router-dom';

/** Top spacing for screens that have not been rebuilt yet. Rebuilt screens set their own. */
export default function LegacyScreen() {
  return (
    <div className="pt-4 lg:pt-8">
      <Outlet />
    </div>
  );
}
