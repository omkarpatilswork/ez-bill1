import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import PageTransition from './PageTransition';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop header */}
          <header className="h-12 sm:h-14 hidden md:flex items-center px-4" style={{ background: 'hsla(160, 12%, 10%, 0.5)', backdropFilter: 'blur(32px) saturate(1.6)', borderBottom: '1px solid hsla(160, 10%, 40%, 0.1)', boxShadow: 'inset 0 -1px 0 0 hsla(0,0%,0%,0.1)' }}>
            <SidebarTrigger className="mr-4 text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gold-gradient">EZ Bill</span>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto pb-24 md:pb-6">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
