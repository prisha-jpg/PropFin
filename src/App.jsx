import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import PageNotFound from "@/lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";

import AppLayout from "@/components/layout/AppLayout";

import Dashboard from "@/pages/Dashboard";
import AllCustomers from "@/pages/customers/AllCustomers";
import Bookings from "@/pages/customers/Bookings";
import SalesOrders from "@/pages/customers/SalesOrders";
import DemandLetters from "@/pages/demands/DemandLetters";
import GenerateDemand from "@/pages/demands/GenerateDemand";
import PaymentJournal from "@/pages/receipts/PaymentJournal";
import LedgerReport from "@/pages/reports/LedgerReport";
import InterestReport from "@/pages/reports/InterestReport";
import SalesReceiptReport from "@/pages/reports/SalesReceiptReport";
import OutstandingReport from "@/pages/reports/OutstandingReport";
import ProvisionalStatement from "@/pages/reports/ProvisionalStatement";
import HandoverGenerate from "@/pages/workflows/HandoverGenerate";
import HandoverApproved from "@/pages/workflows/HandoverApproved";
import CancellationRequestPage from "@/pages/workflows/CancellationRequest";
import CancellationApproved from "@/pages/workflows/CancellationApproved";
import RefundRequestPage from "@/pages/workflows/RefundRequest";
import ShiftingRequestPage from "@/pages/workflows/ShiftingRequest";
import ResaleRequestPage from "@/pages/workflows/ResaleRequest";
import GenerateBankDoc from "@/pages/bank/GenerateBankDoc";
import BankDocInquiry from "@/pages/bank/BankDocInquiry";
import GenerateTDS from "@/pages/tds/GenerateTDS";
import ViewTDS from "@/pages/tds/ViewTDS";
import GenerateReminder from "@/pages/reminders/GenerateReminder";
import ReminderInquiry from "@/pages/reminders/ReminderInquiry";
import InterestSettlement from "@/pages/interest/InterestSettlement";
import InterestCalculation from "@/pages/interest/InterestCalculation";
import InterestSummary from "@/pages/interest/InterestSummary";
import FPVCalculation from "@/pages/interest/FPVCalculation";
import Agreements from "@/pages/other/Agreements";
import WaiverRequestPage from "@/pages/other/WaiverRequest";
import WaiverTypes from "@/pages/other/WaiverTypes";
import DocumentChecklistPage from "@/pages/setup/DocumentChecklist";
import ProjectDemandNumbers from "@/pages/setup/ProjectDemandNumbers";
import BankMasterPage from "@/pages/setup/BankMasterPage";
import TDSAccountPage from "@/pages/setup/TDSAccountPage";

function AuthenticatedApp() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === "user_not_registered") {
      return <UserNotRegisteredError />;
    }
    if (authError.type === "auth_required") {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<AllCustomers />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/sales-orders" element={<SalesOrders />} />
        <Route path="/demand-letters" element={<DemandLetters />} />
        <Route path="/demand-letters/generate" element={<GenerateDemand />} />
        <Route path="/receipts" element={<PaymentJournal />} />
        <Route path="/reports/ledger" element={<LedgerReport />} />
        <Route path="/reports/interest" element={<InterestReport />} />
        <Route path="/reports/sales-receipt" element={<SalesReceiptReport />} />
        <Route path="/reports/outstanding" element={<OutstandingReport />} />
        <Route path="/reports/provisional" element={<ProvisionalStatement />} />
        <Route path="/handover/generate" element={<HandoverGenerate />} />
        <Route path="/handover/approved" element={<HandoverApproved />} />
        <Route path="/cancellation/request" element={<CancellationRequestPage />} />
        <Route path="/cancellation/approved" element={<CancellationApproved />} />
        <Route path="/refund" element={<RefundRequestPage />} />
        <Route path="/shifting" element={<ShiftingRequestPage />} />
        <Route path="/resale" element={<ResaleRequestPage />} />
        <Route path="/bank-documents/generate" element={<GenerateBankDoc />} />
        <Route path="/bank-documents/inquiry" element={<BankDocInquiry />} />
        <Route path="/tds/generate" element={<GenerateTDS />} />
        <Route path="/tds/view" element={<ViewTDS />} />
        <Route path="/reminders/generate" element={<GenerateReminder />} />
        <Route path="/reminders/inquiry" element={<ReminderInquiry />} />
        <Route path="/interest/settlement" element={<InterestSettlement />} />
        <Route path="/interest/calculation" element={<InterestCalculation />} />
        <Route path="/interest/summary" element={<InterestSummary />} />
        <Route path="/interest/fpv" element={<FPVCalculation />} />
        <Route path="/agreements" element={<Agreements />} />
        <Route path="/waiver/request" element={<WaiverRequestPage />} />
        <Route path="/waiver/types" element={<WaiverTypes />} />
        <Route path="/setup/document-checklist" element={<DocumentChecklistPage />} />
        <Route path="/setup/demand-numbers" element={<ProjectDemandNumbers />} />
        <Route path="/setup/bank-master" element={<BankMasterPage />} />
        <Route path="/setup/tds-account" element={<TDSAccountPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;