import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Search, Phone, Mail, Globe, ChevronRight, Receipt, Headphones,
  Utensils, ShoppingBag, Plane, Smartphone, Tv, Pill, Car, Home,
} from 'lucide-react';
import { smartCategoryFromMerchant } from '@/lib/smart-category';
import type { Expense } from '@/lib/types';

type Provider = {
  name: string;
  website: string;
  phone: string;
  email: string;
};

type ProviderCategory = {
  label: string;
  icon: any;
  providers: Provider[];
};

const PROVIDER_DIRECTORY: ProviderCategory[] = [
  {
    label: 'Food Delivery',
    icon: Utensils,
    providers: [
      { name: 'Swiggy', website: 'https://www.swiggy.com', phone: '080-67466729', email: 'support@swiggy.in' },
      { name: 'Zomato', website: 'https://www.zomato.com', phone: '080-67466777', email: 'support@zomato.com' },
      { name: 'EatSure', website: 'https://www.eatsure.com', phone: '1800-208-1234', email: 'support@eatsure.com' },
    ],
  },
  {
    label: 'Quick Commerce',
    icon: ShoppingBag,
    providers: [
      { name: 'Zepto', website: 'https://www.zeptonow.com', phone: '1800-309-0123', email: 'support@zeptonow.com' },
      { name: 'Blinkit', website: 'https://blinkit.com', phone: '1860-123-1000', email: 'info@blinkit.com' },
      { name: 'Swiggy Instamart', website: 'https://www.swiggy.com/instamart', phone: '080-67466729', email: 'support@swiggy.in' },
      { name: 'BigBasket', website: 'https://www.bigbasket.com', phone: '1860-123-1000', email: 'customerservice@bigbasket.com' },
    ],
  },
  {
    label: 'E-Commerce',
    icon: ShoppingBag,
    providers: [
      { name: 'Amazon India', website: 'https://www.amazon.in', phone: '1800-3000-9009', email: 'cs-reply@amazon.in' },
      { name: 'Flipkart', website: 'https://www.flipkart.com', phone: '044-45614700', email: 'cs@flipkart.com' },
      { name: 'Myntra', website: 'https://www.myntra.com', phone: '080-61561000', email: 'help@myntra.com' },
      { name: 'Ajio', website: 'https://www.ajio.com', phone: '1800-889-9991', email: 'help@ajio.com' },
      { name: 'Meesho', website: 'https://www.meesho.com', phone: '080-61799600', email: 'help@meesho.com' },
      { name: 'Nykaa', website: 'https://www.nykaa.com', phone: '1800-267-3777', email: 'support@nykaa.com' },
    ],
  },
  {
    label: 'Electronics',
    icon: Smartphone,
    providers: [
      { name: 'Apple India', website: 'https://www.apple.com/in', phone: '1800-419-0808', email: 'support.in@apple.com' },
      { name: 'Samsung India', website: 'https://www.samsung.com/in', phone: '1800-5-7267864', email: 'support.india@samsung.com' },
      { name: 'OnePlus', website: 'https://www.oneplus.in', phone: '1800-102-8411', email: 'support.in@oneplus.com' },
      { name: 'Xiaomi India', website: 'https://www.mi.com/in', phone: '1800-103-6286', email: 'service.in@xiaomi.com' },
      { name: 'Croma', website: 'https://www.croma.com', phone: '1800-572-7662', email: 'customersupport@croma.com' },
      { name: 'Reliance Digital', website: 'https://www.reliancedigital.in', phone: '1800-889-1044', email: 'customercare@reliancedigital.in' },
    ],
  },
  {
    label: 'Travel & Stay',
    icon: Plane,
    providers: [
      { name: 'MakeMyTrip', website: 'https://www.makemytrip.com', phone: '0124-2898-747', email: 'support@makemytrip.com' },
      { name: 'Goibibo', website: 'https://www.goibibo.com', phone: '0124-5045-105', email: 'support@goibibo.com' },
      { name: 'Yatra', website: 'https://www.yatra.com', phone: '95-95-800-800', email: 'support@yatra.com' },
      { name: 'IRCTC', website: 'https://www.irctc.co.in', phone: '14646', email: 'care@irctc.co.in' },
      { name: 'IndiGo', website: 'https://www.goindigo.in', phone: '0124-6173838', email: 'customer.relations@goindigo.in' },
      { name: 'Air India', website: 'https://www.airindia.com', phone: '011-24667473', email: 'contactus@airindia.in' },
      { name: 'OYO', website: 'https://www.oyorooms.com', phone: '93139-31393', email: 'support@oyorooms.com' },
    ],
  },
  {
    label: 'Cabs',
    icon: Car,
    providers: [
      { name: 'Uber India', website: 'https://www.uber.com/in', phone: '080-68285501', email: 'support@uber.com' },
      { name: 'Ola', website: 'https://www.olacabs.com', phone: '080-67350900', email: 'customercare@olacabs.com' },
      { name: 'Rapido', website: 'https://rapido.bike', phone: '080-67129392', email: 'support@rapido.bike' },
    ],
  },
  {
    label: 'Entertainment',
    icon: Tv,
    providers: [
      { name: 'BookMyShow', website: 'https://in.bookmyshow.com', phone: '022-39895050', email: 'customer.service@bookmyshow.com' },
      { name: 'Netflix India', website: 'https://www.netflix.com/in', phone: '000-800-040-1843', email: 'info@netflix.com' },
      { name: 'Hotstar / JioHotstar', website: 'https://www.hotstar.com', phone: '1800-208-1860', email: 'help@hotstar.com' },
      { name: 'Spotify India', website: 'https://www.spotify.com/in', phone: '—', email: 'support@spotify.com' },
      { name: 'Prime Video', website: 'https://www.primevideo.com', phone: '1800-3000-9009', email: 'cs-reply@amazon.in' },
    ],
  },
  {
    label: 'Telecom & Utilities',
    icon: Smartphone,
    providers: [
      { name: 'Jio', website: 'https://www.jio.com', phone: '199', email: 'care@jio.com' },
      { name: 'Airtel', website: 'https://www.airtel.in', phone: '121', email: 'customercare@airtel.com' },
      { name: 'Vi (Vodafone Idea)', website: 'https://www.myvi.in', phone: '199', email: 'customercare@vodafoneidea.com' },
      { name: 'Tata Power', website: 'https://www.tatapower.com', phone: '1800-209-5161', email: 'customercare@tatapower.com' },
    ],
  },
  {
    label: 'Pharmacy & Health',
    icon: Pill,
    providers: [
      { name: 'PharmEasy', website: 'https://pharmeasy.in', phone: '022-50603333', email: 'care@pharmeasy.in' },
      { name: 'Tata 1mg', website: 'https://www.1mg.com', phone: '0124-4222200', email: 'care@1mg.com' },
      { name: 'Apollo Pharmacy', website: 'https://www.apollopharmacy.in', phone: '1860-500-0101', email: 'customercare@apollopharmacy.org' },
      { name: 'Practo', website: 'https://www.practo.com', phone: '080-67264444', email: 'support@practo.com' },
    ],
  },
  {
    label: 'Lifestyle & Home',
    icon: Home,
    providers: [
      { name: 'IKEA India', website: 'https://www.ikea.com/in/en', phone: '1800-419-4532', email: 'customercare.in@ikea.com' },
      { name: 'Urban Company', website: 'https://www.urbancompany.com', phone: '—', email: 'help@urbancompany.com' },
      { name: 'Pepperfry', website: 'https://www.pepperfry.com', phone: '022-61566666', email: 'help@pepperfry.com' },
      { name: 'Lenskart', website: 'https://www.lenskart.com', phone: '1800-111-111', email: 'support@lenskart.com' },
    ],
  },
];

export default function Support() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('expenses').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => {
        setExpenses((data as unknown as Expense[]) || []);
        setLoading(false);
      });
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROVIDER_DIRECTORY;
    return PROVIDER_DIRECTORY
      .map(cat => ({
        ...cat,
        providers: cat.providers.filter(p =>
          p.name.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.providers.length > 0);
  }, [query]);

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none animate-fade-in pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'hsla(199, 70%, 45%, 0.12)' }}>
          <Headphones className="h-5 w-5 text-info" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Support Directory</h1>
          <p className="text-xs text-muted-foreground">Contact details for top brands in India</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search brand or category..."
          className="w-full pl-10 pr-4 py-3 rounded-xl glass-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Provider directory */}
      <div className="space-y-5">
        {filtered.map(cat => (
          <div key={cat.label}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'hsla(160, 12%, 18%, 0.5)' }}>
                <cat.icon className="h-3.5 w-3.5 text-gold" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{cat.label}</h2>
            </div>
            <div className="space-y-2">
              {cat.providers.map(p => (
                <div key={p.name} className="glass-card rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-foreground">{p.name}</span>
                    <a href={p.website} target="_blank" rel="noreferrer"
                      className="text-[11px] text-gold font-medium flex items-center gap-0.5 hover:underline">
                      Website <ChevronRight className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.phone && p.phone !== '—' && (
                      <a href={`tel:${p.phone.replace(/\s/g, '')}`}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground glass-button px-2.5 py-1.5 rounded-lg hover:text-foreground">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </a>
                    )}
                    {p.email && (
                      <a href={`mailto:${p.email}`}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground glass-button px-2.5 py-1.5 rounded-lg hover:text-foreground">
                        <Mail className="h-3 w-3" /> {p.email}
                      </a>
                    )}
                    <a href={p.website} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground glass-button px-2.5 py-1.5 rounded-lg hover:text-foreground">
                      <Globe className="h-3 w-3" /> Visit site
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No brands match your search.</p>
        )}
      </div>

      {/* Recent Bills — for per-bill support */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold text-foreground">Need help with a specific bill?</h2>
          <Link to="/expenses" className="text-[11px] text-gold font-medium flex items-center gap-0.5">
            View All <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <div className="glass-card rounded-2xl p-6 text-center text-sm text-muted-foreground">Loading bills…</div>
        ) : expenses.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center">
            <Receipt className="mx-auto h-8 w-8 mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No bills yet — add a bill to get merchant-specific support.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.slice(0, 5).map((exp) => (
              <button
                key={exp.id}
                onClick={() => navigate(`/expenses/${exp.id}/support`)}
                className="w-full text-left rounded-xl bg-card border border-border/30 p-3.5 hover:bg-muted/20 active:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
                    <Headphones className="h-4 w-4 text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{exp.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {exp.merchant || '—'} · {new Date(exp.expense_date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-info">Get Support</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
