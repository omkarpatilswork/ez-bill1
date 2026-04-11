import { Home, BarChart3, IndianRupee, Inbox, Plus, Camera, Upload, FileText } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Home', icon: Home, path: '/' },
  { label: 'Insights', icon: BarChart3, path: '/analytics' },
  { label: 'add', icon: Plus, path: '' },
  { label: 'All Bills', icon: IndianRupee, path: '/expenses' },
  { label: 'Import', icon: Inbox, path: '/email-bills' },
];

const addActions = [
  { label: 'Scan Bill', icon: Camera, description: 'Take a photo of your receipt', path: '/expenses/new?mode=scan' },
  { label: 'Upload File', icon: Upload, description: 'Upload from gallery or files', path: '/expenses/new?mode=upload' },
  { label: 'Bulk Upload', icon: FileImage, description: 'Upload multiple bills at once', path: '/bulk-upload' },
  { label: 'Add Manually', icon: FileText, description: 'Enter details by hand', path: '/expenses/new' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/30 md:hidden">
        <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
          {tabs.map((tab) => {
            if (tab.label === 'add') {
              return (
                <button
                  key="add"
                  onClick={() => setSheetOpen(true)}
                  className="relative -mt-6 flex items-center justify-center"
                >
                  <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 animate-pulse-glow transition-transform active:scale-95">
                    <Plus className="h-7 w-7 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                </button>
              );
            }

            const active = isActive(tab.path);
            return (
              <button
                key={tab.label}
                onClick={() => navigate(tab.path)}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-colors min-w-[56px]',
                  active ? 'text-gold' : 'text-muted-foreground'
                )}
              >
                <tab.icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_6px_hsla(43,80%,50%,0.5)]')} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-card border-border/30 pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-foreground">Add New Bill</SheetTitle>
          </SheetHeader>
          <div className="space-y-2">
            {addActions.map((action) => (
              <button
                key={action.label}
                onClick={() => { setSheetOpen(false); navigate(action.path); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-secondary transition-colors active:bg-secondary/80"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
