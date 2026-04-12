import {
  LayoutDashboard, Receipt, PlusCircle,
  PieChart, LogOut, MessageSquare, Mail, Droplets,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const menuItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'New Bill', url: '/expenses/new', icon: PlusCircle },
  { title: 'All Bills', url: '/expenses', icon: Receipt },
  { title: 'Analytics', url: '/analytics', icon: PieChart },
  { title: 'Money Leaks', url: '/money-leaks', icon: Droplets },
  { title: 'Ask AI', url: '/ask-ai', icon: MessageSquare },
  { title: 'Import Bills', url: '/email-bills', icon: Mail },
];

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Receipt className="h-4 w-4 text-primary-foreground" />
              </div>
              {!collapsed && <span className="font-bold text-lg text-gold-gradient">EZ Bill</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!collapsed && (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium truncate text-foreground">{profile?.full_name || 'User'}</span>
                  <span className="text-xs text-muted-foreground truncate">{profile?.department}</span>
                </div>
              </div>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
