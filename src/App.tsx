import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Assumptions from "./pages/Assumptions";
import ArSchedule from "./pages/ArSchedule";
import FutureHires from "./pages/FutureHires";
import VarianceInsights from "./pages/VarianceInsights";
import AuditLog from "./pages/AuditLog";
import AdminSettings from "./pages/AdminSettings";
import BankImports from "./pages/BankImports";
import Transactions from "./pages/Transactions";
import Integrations from "./pages/Integrations";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Shell = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={<Shell><Dashboard /></Shell>} />
            <Route path="/assumptions" element={<Shell><Assumptions /></Shell>} />
            <Route path="/ar-schedule" element={<Shell><ArSchedule /></Shell>} />
            <Route path="/future-hires" element={<Shell><FutureHires /></Shell>} />
            <Route path="/variance" element={<Shell><VarianceInsights /></Shell>} />
            <Route path="/audit-log" element={<Shell><AuditLog /></Shell>} />
            <Route path="/bank-imports" element={<Shell><BankImports /></Shell>} />
            <Route path="/transactions" element={<Shell><Transactions /></Shell>} />
            <Route path="/integrations" element={<Shell><Integrations /></Shell>} />
            <Route path="/admin-settings" element={<Shell><AdminSettings /></Shell>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
