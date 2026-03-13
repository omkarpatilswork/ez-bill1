import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Receipt } from 'lucide-react';
import loginBg from '@/assets/login-bg.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
    } else {
      navigate('/');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast({ title: 'Google sign in failed', description: String(result.error), variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Google sign in failed', description: 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-background px-4 sm:px-8">
        <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Receipt className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl">ExpenseDesk</CardTitle>
            <CardDescription>Sign in to manage your expenses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>
          </CardContent>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" className="min-h-[44px]" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" className="min-h-[44px]" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/signup" className="text-primary hover:underline">Sign up</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Right side - Hero image */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img
          src={loginBg}
          alt="Business professionals analyzing financial data on a rooftop with city skyline"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-8 right-8 text-white">
          <h2 className="text-3xl font-bold tracking-tight">Streamline your expense management</h2>
          <p className="mt-2 text-lg text-white/80">Submit, track, and approve expenses — all in one place.</p>
        </div>
      </div>
    </div>
  );
}
