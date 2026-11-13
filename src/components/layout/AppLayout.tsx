import AppShell from '@/components/next/AppShell';

/** Wraps a screen that has not been rebuilt yet in the app shell (navigation, Add a bill, account menu). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-8">{children}</div>
    </AppShell>
  );
}
