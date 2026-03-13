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
import Analytics from "./pages/expenses/Analytics";
import AskAI from "./pages/AskAI";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import PendingApprovals from "./pages/manager/PendingApprovals";
import FinanceDashboard from "./pages/finance/FinanceDashboard";
import AllExpenses from "./pages/finance/AllExpenses";
import Reports from "./pages/finance/Reports";
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
          <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/new" element={<ProtectedRoute><AppLayout><NewExpense /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses/:id" element={<ProtectedRoute><AppLayout><ExpenseDetail /></AppLayout></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><AppLayout><MyExpenses /></AppLayout></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AppLayout><Analytics /></AppLayout></ProtectedRoute>} />
          <Route path="/ask-ai" element={<ProtectedRoute><AppLayout><AskAI /></AppLayout></ProtectedRoute>} />
          <Route path="/manager" element={<ProtectedRoute><AppLayout><ManagerDashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/manager/approvals" element={<ProtectedRoute><AppLayout><PendingApprovals /></AppLayout></ProtectedRoute>} />
          <Route path="/finance" element={<ProtectedRoute><AppLayout><FinanceDashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/finance/expenses" element={<ProtectedRoute><AppLayout><AllExpenses /></AppLayout></ProtectedRoute>} />
          <Route path="/finance/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
