import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/useTheme";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import LegacyScreen from "@/components/layout/AppLayout";
import AppShell from "@/components/next/AppShell";
import Login from "./pages/Login";
import Home from "./pages/next/Home";
import { checkDueReminders } from "@/lib/return-reminders";

// Sign-in and Home are in the first download. Every other screen is fetched when it is opened.
const Bills = lazy(() => import("./pages/next/Bills"));
const BillDetail = lazy(() => import("./pages/next/BillDetail"));
const Signup = lazy(() => import("./pages/Signup"));
const AddBill = lazy(() => import("./pages/next/AddBill"));
const MerchantSupport = lazy(() => import("./pages/expenses/MerchantSupport"));
const SplitBill = lazy(() => import("./pages/next/SplitBill"));
const Spending = lazy(() => import("./pages/next/Spending"));
const AskAi = lazy(() => import("./pages/next/AskAi"));
const EmailBills = lazy(() => import("./pages/expenses/EmailBills"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const MoneyLeaks = lazy(() => import("./pages/next/MoneyLeaks"));
const Subscriptions = lazy(() => import("./pages/next/Subscriptions"));
const MonthlySummary = lazy(() => import("./pages/next/MonthlySummary"));
const Documents = lazy(() => import("./pages/next/Documents"));
const Security = lazy(() => import("./pages/Security"));
const WarrantyVault = lazy(() => import("./pages/next/WarrantyVault"));
const Splits = lazy(() => import("./pages/next/Splits"));
const SplitFriend = lazy(() => import("./pages/next/SplitFriend"));
const Support = lazy(() => import("./pages/Support"));
const ClaimTag = lazy(() => import("./pages/ClaimTag"));
const StaffTables = lazy(() => import("./pages/StaffTables"));
const NfcAirdrop = lazy(() => import("./pages/NfcAirdrop"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const Loading = () => (
  <div className="ez-app grid min-h-screen place-items-center" aria-busy="true" aria-label="Loading">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
  </div>
);

const App = () => {
  useEffect(() => {
    checkDueReminders();
    const i = setInterval(checkDueReminders, 6 * 60 * 60 * 1000);
    return () => clearInterval(i);
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
        <Routes>
          {/* Outside the app shell */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/t/:tagId" element={<ClaimTag />} />

          {/* Signed-in screens share one shell: Home, Bills, Insights, Vault and Add a bill */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            {/* Rebuilt in the Ink & Paper design */}
            <Route path="/" element={<Home />} />
            <Route path="/expenses" element={<Bills />} />
            <Route path="/expenses/:id" element={<BillDetail />} />
            <Route path="/analytics" element={<Spending />} />
            <Route path="/money-leaks" element={<MoneyLeaks />} />
            <Route path="/summary" element={<MonthlySummary />} />
            <Route path="/expenses/new" element={<AddBill />} />
            <Route path="/bulk-upload" element={<Navigate to="/expenses/new?mode=upload" replace />} />
            <Route path="/ask-ai" element={<AskAi />} />
            <Route path="/expenses/:id/split" element={<SplitBill />} />
            <Route path="/splits" element={<Splits />} />
            <Route path="/splits/friend/:friendKey" element={<SplitFriend />} />
            <Route path="/warranties" element={<WarrantyVault />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/financial-docs" element={<Documents />} />

            {/* Not rebuilt yet: brand colours and fonts, old layouts */}
            <Route element={<LegacyScreen />}>
              <Route path="/expenses/:id/support" element={<MerchantSupport />} />
              <Route path="/email-bills" element={<EmailBills />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/security" element={<Security />} />
              <Route path="/support" element={<Support />} />
              <Route path="/staff" element={<StaffTables />} />
              <Route path="/nfc-airdrop" element={<NfcAirdrop />} />
            </Route>
          </Route>

          <Route path="/next" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
