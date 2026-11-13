import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, House, LogOut, Moon, Plus, ReceiptText, Search, Settings, ShieldCheck, Sun, UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Wordmark } from './Logo';
import CaptureSheet from './CaptureSheet';
import { CaptureContext } from './capture-context';

interface Destination {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

/**
 * Four places and one button. The same four on a phone and on a desktop.
 * Bills, Insights and Vault point at the current pages until those screens
 * are redesigned.
 */
const DESTINATIONS: Destination[] = [
  { label: 'Home', to: '/next', icon: House, end: true },
  { label: 'Bills', to: '/expenses', icon: ReceiptText },
  { label: 'Insights', to: '/money-leaks', icon: BarChart3 },
  { label: 'Vault', to: '/warranties', icon: ShieldCheck },
];

const MENU_ITEM = 'cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-fg focus:bg-surface-3 focus:text-fg';

function initialsOf(name: string | null | undefined) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts.slice(0, 2).map((p) => p[0]).join('') : '?').toUpperCase();
}

function AccountMenu({ children, side }: { children: ReactNode; side: 'top' | 'bottom' }) {
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === 'top' ? 'start' : 'end'} sideOffset={8}
        className="ez-app w-56 rounded-2xl border-line bg-surface-2 p-1.5 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)]">
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => navigate('/profile')}>
          <UserRound className="h-4 w-4 text-dim" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => navigate('/settings')}>
          <Settings className="h-4 w-4 text-dim" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
          {theme === 'dark' ? <Sun className="h-4 w-4 text-dim" /> : <Moon className="h-4 w-4 text-dim" />}
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-line-soft" />
        <DropdownMenuItem className={MENU_ITEM} onSelect={async () => { await signOut(); navigate('/login'); }}>
          <LogOut className="h-4 w-4 text-dim" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AppShellProps {
  children: ReactNode;
  /** On a phone, replace the wordmark with a back link (detail screens). */
  back?: { to: string; label: string };
  /** Buttons for the right side of the phone top bar on detail screens. */
  actions?: ReactNode;
}

export default function AppShell({ children, back, actions }: AppShellProps) {
  const { profile, user } = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const name = profile?.full_name || profile?.display_name || '';
  const initials = initialsOf(name);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <CaptureContext.Provider value={() => setCaptureOpen(true)}>
    <div className="ez-app min-h-screen lg:pl-[248px]">
      {/* ---------- desktop rail ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line-soft bg-surface px-4 pb-4 pt-6 lg:flex">
        <Link to="/next" className="px-2" aria-label="EZZ BILL home"><Wordmark /></Link>

        <button type="button" onClick={() => setCaptureOpen(true)} className="ez-btn ez-btn--primary mt-8 w-full">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} /> Add a bill
        </button>

        <nav className="mt-6 space-y-1" aria-label="Main">
          {DESTINATIONS.map((d) => (
            <NavLink key={d.label} to={d.to} end={d.end}
              className={({ isActive }) => cn(
                'group flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium',
                isActive ? 'bg-surface-3 text-fg' : 'text-dim hover:bg-surface-2 hover:text-fg',
              )}>
              {({ isActive }) => (
                <>
                  <d.icon className={cn('h-[19px] w-[19px]', isActive ? 'text-brand-text' : 'text-faint group-hover:text-dim')} strokeWidth={1.75} />
                  {d.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <AccountMenu side="top">
          <button type="button" className="mt-auto flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
            <span className="ez-num grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-[12px] font-medium text-fg">{initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold leading-tight text-fg">{name || 'Your account'}</span>
              <span className="block truncate text-[12.5px] text-faint">{user?.email}</span>
            </span>
          </button>
        </AccountMenu>
      </aside>

      {/* ---------- desktop top bar ---------- */}
      <header className="sticky top-0 z-30 hidden h-[68px] items-center border-b border-line-soft bg-surface/90 backdrop-blur-md lg:flex">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-6 px-10">
          <Link to="/expenses" className="flex h-10 w-full max-w-[440px] items-center gap-3 rounded-full border border-line-soft bg-surface-2 px-4 text-[14px] text-faint hover:border-line">
            <Search className="h-4 w-4" />
            <span className="flex-1">Search bills, merchants, items</span>
            <kbd className="ez-num rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint">Ctrl K</kbd>
          </Link>
          <span className="ez-label ez-label--quiet">{today}</span>
        </div>
      </header>

      {/* ---------- phone top bar ---------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-surface/90 px-4 backdrop-blur-md lg:hidden">
        {back ? (
          <Link to={back.to} className="-ml-2 flex h-10 items-center gap-1.5 rounded-full px-2 text-[15px] font-medium text-dim hover:text-fg">
            <ArrowLeft className="h-5 w-5" /> {back.label}
          </Link>
        ) : (
          <Link to="/next" aria-label="EZZ BILL home"><Wordmark /></Link>
        )}
        <div className="flex items-center gap-2">
          {back ? actions : (
            <>
              <Link to="/expenses" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full border border-line-soft text-dim hover:text-fg">
                <Search className="h-[18px] w-[18px]" />
              </Link>
              <AccountMenu side="bottom">
                <button type="button" aria-label="Account" className="ez-num grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-[12px] font-medium text-fg">{initials}</button>
              </AccountMenu>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 sm:px-6 lg:px-10 lg:pb-20">{children}</main>

      {/* ---------- phone tab bar ---------- */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
          {DESTINATIONS.slice(0, 2).map((d) => <Tab key={d.label} {...d} />)}
          <div className="grid place-items-center">
            <button type="button" onClick={() => setCaptureOpen(true)} aria-label="Add a bill"
              className="-mt-7 grid h-[58px] w-[58px] place-items-center rounded-full bg-brand text-on-brand ring-[5px] ring-surface transition-transform duration-200 hover:bg-brand-hover active:scale-95">
              <Plus className="h-7 w-7" strokeWidth={2.25} />
            </button>
          </div>
          {DESTINATIONS.slice(2).map((d) => <Tab key={d.label} {...d} />)}
        </div>
      </nav>

      <CaptureSheet open={captureOpen} onOpenChange={setCaptureOpen} />
    </div>
    </CaptureContext.Provider>
  );
}

function Tab({ label, to, icon: Icon, end }: Destination) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn(
        'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[.01em]',
        isActive ? 'text-brand-text' : 'text-faint hover:text-dim',
      )}>
      <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
      {label}
    </NavLink>
  );
}
