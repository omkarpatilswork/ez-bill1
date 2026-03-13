import {
  LayoutDashboard, Receipt, PlusCircle, Users, CheckSquare,
  Building2, BarChart3, LogOut, ChevronDown, PieChart, MessageSquare,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const employeeItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'New Expense', url: '/expenses/new', icon: PlusCircle },
  { title: 'My Expenses', url: '/expenses', icon: Receipt },
  { title: 'Analytics', url: '/analytics', icon: PieChart },
  { title: 'Ask AI', url: '/ask-ai', icon: MessageSquare },
];

const managerItems = [
  { title: 'Team Dashboard', url: '/manager', icon: Users },
  { title: 'Pending Approvals', url: '/manager/approvals', icon: CheckSquare },
];

const financeItems = [
  { title: 'Finance Dashboard', url: '/finance', icon: Building2 },
  { title: 'All Expenses', url: '/finance/expenses', icon: Receipt },
  { title: 'Reports', url: '/finance/reports', icon: BarChart3 },
];

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, hasRole, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Receipt className="h-4 w-4 text-primary-foreground" />
              </div>
              {!collapsed && <span className="font-bold text-lg">ExpenseDesk</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Employee section - always visible */}
        <SidebarGroup>
          <SidebarGroupLabel>Expenses</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {employeeItems.map(item => (
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

        {/* Manager section */}
        {hasRole('manager') && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer">
                  Manager
                  {!collapsed && <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {managerItems.map(item => (
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Finance section */}
        {hasRole('finance') && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer">
                  Finance
                  {!collapsed && <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {financeItems.map(item => (
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
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
                  <span className="text-sm font-medium truncate">{profile?.full_name || 'User'}</span>
                  <span className="text-xs text-sidebar-foreground/60 truncate">{profile?.department}</span>
                </div>
              </div>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
