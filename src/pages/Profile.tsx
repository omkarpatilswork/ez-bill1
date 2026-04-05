import { useAuth } from '@/hooks/useAuth';
import { User, Mail, Building2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const fullName = profile?.full_name || user?.user_metadata?.full_name || 'User';
  const email = user?.email || '';
  const department = profile?.department || '—';

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 md:hidden">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-foreground">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account</p>
      </div>

      <div className="glass-card rounded-2xl p-6 flex flex-col items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">{fullName}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm text-foreground">{email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Department</p>
            <p className="text-sm text-foreground">{department}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
