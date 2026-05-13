import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import PageTransition from './PageTransition';
import { useTheme } from '@/hooks/useTheme';
import { useAutoSyncBills } from '@/hooks/useAutoSyncBills';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  useAutoSyncBills();
  const headerStyle = theme === 'light'
    ? { background: 'hsla(0, 0%, 100%, 0.7)', backdropFilter: 'blur(32px) saturate(1.6)', borderBottom: '1px solid hsla(160, 10%, 80%, 0.3)', boxShadow: '0 1px 3px hsla(0,0%,0%,0.04)' }
    : { background: 'hsla(160, 12%, 10%, 0.5)', backdropFilter: 'blur(32px) saturate(1.6)', borderBottom: '1px solid hsla(160, 10%, 40%, 0.1)', boxShadow: 'inset 0 -1px 0 0 hsla(0,0%,0%,0.1)' };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 sm:h-14 hidden md:flex items-center px-4" style={headerStyle}>
            <SidebarTrigger className="mr-4 text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gold-gradient">EZ Bill</span>
            </div>
          </header>
          <main id="main-content" className="flex-1 p-4 md:p-6 overflow-auto pb-24 md:pb-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
