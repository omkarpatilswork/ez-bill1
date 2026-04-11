import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
          <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/new" element={<ProtectedRoute><AppLayout><NewExpense /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id" element={<ProtectedRoute><AppLayout><ExpenseDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id/support" element={<ProtectedRoute><AppLayout><MerchantSupport /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id/split" element={<ProtectedRoute><AppLayout><SplitBill /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><AppLayout><MyExpenses /></AppLayout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AppLayout><Analytics /></AppLayout></ProtectedRoute>} />
          <Route path="/email-bills" element={<ProtectedRoute><AppLayout><EmailBills /></AppLayout></ProtectedRoute>} />
          <Route path="/ask-ai" element={<ProtectedRoute><AppLayout><AskAI /></AppLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
