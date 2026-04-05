import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, Phone, Globe, Mail, MapPin, Star, ExternalLink, Loader2, Store
} from 'lucide-react';

interface MerchantInfo {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  google_maps_url?: string;
  rating?: string;
  return_policy?: string;
  warranty_info?: string;
}

export default function MerchantSupport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState('');
  const [info, setInfo] = useState<MerchantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('expenses').select('merchant').eq('id', id).single();
      const name = (data as any)?.merchant || '';
      setMerchant(name);
      if (!name) { setLoading(false); return; }

      try {
        const { data: aiData, error } = await supabase.functions.invoke('ask-ai', {
          body: {
            messages: [{
              role: 'user',
              content: `Find detailed support info for "${name}" in India. Return ONLY a JSON object with these fields:
- phone: customer care phone number
- email: customer support email
- website: official support/returns/warranty page URL
- address: registered/main office address
- google_maps_url: Google Maps search URL for this business
- rating: Google rating if known (e.g. "4.2/5")
- return_policy: brief return/refund policy summary (1-2 sentences)
- warranty_info: brief warranty info (1-2 sentences)
Use null for unknown fields. No other text.`
            }]
          }
        });
        if (error) throw error;
        const text = aiData?.choices?.[0]?.message?.content || aiData?.content || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          setInfo(JSON.parse(jsonMatch[0]));
        } else {
          setInfo({ google_maps_url: `https://www.google.com/maps/search/${encodeURIComponent(name)}` });
        }
      } catch {
        setInfo({ google_maps_url: `https://www.google.com/maps/search/${encodeURIComponent(name)}` });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold text-foreground truncate">Support & Returns</h1>
      </div>

      {/* Merchant Header */}
      <Card className="border-0 bg-card/80 backdrop-blur">
        <CardContent className="pt-5 pb-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">{merchant || 'Unknown Merchant'}</h2>
            {info?.rating && (
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="h-3.5 w-3.5 text-gold fill-gold" />
                <span className="text-sm text-gold font-medium">{info.rating}</span>
                <span className="text-xs text-muted-foreground ml-1">Google Reviews</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Looking up merchant details...</p>
        </div>
      ) : info ? (
        <>
          {/* Contact */}
          <Card className="border-0 bg-card/80 backdrop-blur">
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Contact</p>
              {info.phone && (
                <a href={`tel:${info.phone}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{info.phone}</span>
                </a>
              )}
              {info.email && (
                <a href={`mailto:${info.email}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{info.email}</span>
                </a>
              )}
              {info.website && (
                <a href={info.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <Globe className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">Visit Support Page</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </a>
              )}
              {!info.phone && !info.email && !info.website && (
                <p className="text-sm text-muted-foreground italic">No contact info found</p>
              )}
            </CardContent>
          </Card>

          {/* Address & Maps */}
          {(info.address || info.google_maps_url) && (
            <Card className="border-0 bg-card/80 backdrop-blur">
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Location</p>
                {info.address && (
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/30">
                    <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{info.address}</span>
                  </div>
                )}
                {info.google_maps_url && (
                  <a href={info.google_maps_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <MapPin className="h-4 w-4 text-gold shrink-0" />
                    <span className="text-sm text-foreground">View on Google Maps</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* Returns & Warranty */}
          {(info.return_policy || info.warranty_info) && (
            <Card className="border-0 bg-card/80 backdrop-blur">
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Returns & Warranty</p>
                {info.return_policy && (
                  <div className="p-3 rounded-lg bg-secondary/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Return Policy</p>
                    <p className="text-sm text-foreground">{info.return_policy}</p>
                  </div>
                )}
                {info.warranty_info && (
                  <div className="p-3 rounded-lg bg-secondary/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Warranty</p>
                    <p className="text-sm text-foreground">{info.warranty_info}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Google search fallback */}
          <a href={`https://www.google.com/search?q=${encodeURIComponent(merchant + ' customer support returns warranty India')}`}
            target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full min-h-[44px] text-sm">
              <Globe className="h-4 w-4 mr-2" /> Search More on Google
            </Button>
          </a>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>Could not find merchant information.</p>
        </div>
      )}
    </div>
  );
}
