import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/useTheme";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import NewExpense from "./pages/expenses/NewExpense";
import MyExpenses from "./pages/expenses/MyExpenses";
import ExpenseDetail from "./pages/expenses/ExpenseDetail";
import MerchantSupport from "./pages/expenses/MerchantSupport";
import SplitBill from "./pages/expenses/SplitBill";
import Analytics from "./pages/expenses/Analytics";
import AskAI from "./pages/AskAI";
import EmailBills from "./pages/expenses/EmailBills";
import BulkUpload from "./pages/expenses/BulkUpload";
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import MoneyLeaks from "./pages/MoneyLeaks";
import Subscriptions from "./pages/Subscriptions";
import FinancialDocs from "./pages/FinancialDocs";
import Warranties from "./pages/Warranties";
import Splits from "./pages/Splits";
import SplitFriendDetail from "./pages/SplitFriendDetail";
import Support from "./pages/Support";
import ClaimTag from "./pages/ClaimTag";
import StaffTables from "./pages/StaffTables";
import NotFound from "./pages/NotFound";
import { checkDueReminders } from "@/lib/return-reminders";

const queryClient = new QueryClient();

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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/t/:tagId" element={<ClaimTag />} />
          <Route path="/staff" element={<ProtectedRoute><AppLayout><StaffTables /></AppLayout></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/new" element={<ProtectedRoute><AppLayout><NewExpense /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id" element={<ProtectedRoute><AppLayout><ExpenseDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id/support" element={<ProtectedRoute><AppLayout><MerchantSupport /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id/split" element={<ProtectedRoute><AppLayout><SplitBill /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><AppLayout><MyExpenses /></AppLayout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AppLayout><Analytics /></AppLayout></ProtectedRoute>} />
          <Route path="/email-bills" element={<ProtectedRoute><AppLayout><EmailBills /></AppLayout></ProtectedRoute>} />
          <Route path="/bulk-upload" element={<ProtectedRoute><AppLayout><BulkUpload /></AppLayout></ProtectedRoute>} />
          <Route path="/ask-ai" element={<ProtectedRoute><AppLayout><AskAI /></AppLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
          <Route path="/money-leaks" element={<ProtectedRoute><AppLayout><MoneyLeaks /></AppLayout></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><AppLayout><Subscriptions /></AppLayout></ProtectedRoute>} />
          <Route path="/financial-docs" element={<ProtectedRoute><AppLayout><FinancialDocs /></AppLayout></ProtectedRoute>} />
          <Route path="/warranties" element={<ProtectedRoute><AppLayout><Warranties /></AppLayout></ProtectedRoute>} />
          <Route path="/splits" element={<ProtectedRoute><AppLayout><Splits /></AppLayout></ProtectedRoute>} />
          <Route path="/splits/friend/:friendKey" element={<ProtectedRoute><AppLayout><SplitFriendDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><AppLayout><Support /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
