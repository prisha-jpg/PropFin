import React, { useState, useEffect, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { Download, Plus, Play, ShieldAlert, Database, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import axios from "axios";
import { jsPDF } from "jspdf";

export default function CrmLedgerReport() {
  const [customers, setCustomers] = useState([]);
  const [units, setUnits] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [summaryInfo, setSummaryInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  
  // Custom searchable select dropdown states
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAdminTools, setShowAdminTools] = useState(false);
  const dropdownRef = useRef(null);

  // Modals state
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);

  // Form states
  const [txForm, setTxForm] = useState({
    transaction_date: format(new Date(), "yyyy-MM-dd"),
    consideration_date: format(new Date(), "yyyy-MM-dd"),
    type: "Receipt",
    narration: "",
    debit: "0.00",
    credit: "0.00",
  });

  const [milestoneForm, setMilestoneForm] = useState({
    milestone_name: "",
    milestone_type: "construction",
    installment_amount: "",
    tax_amount: "",
    transaction_date: format(new Date(), "yyyy-MM-dd"),
    consideration_date: format(new Date(), "yyyy-MM-dd"),
  });

  const handleMilestoneFormChange = (fields) => {
    setMilestoneForm(prev => {
      const updated = { ...prev, ...fields };
      if ('installment_amount' in fields || 'milestone_type' in fields) {
        const amt = parseFloat(updated.installment_amount || 0);
        let rate = 0;
        if (updated.milestone_type === "construction") rate = 0.05;
        else if (updated.milestone_type === "services") rate = 0.18;
        else if (updated.milestone_type === "security") rate = 0.00;
        
        updated.tax_amount = (amt * rate).toFixed(2);
      }
      return updated;
    });
  };

  const [interestForm, setInterestForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1, // 1-indexed
    annual_interest_rate: "12.00",
  });

  // Handle click outside of customer selection dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch units, customers, and projects on mount
  useEffect(() => {
    fetchReferenceData();
  }, []);

  // Fetch ledger when selected customer changes
  useEffect(() => {
    if (selectedCustomer) {
      fetchLedger(selectedCustomer.unitId);
    } else {
      setLedgerData([]);
      setSummaryInfo(null);
    }
  }, [selectedCustomer]);

  const fetchReferenceData = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      const [custRes, unitRes, projRes] = await Promise.all([
        fetch("/api/pricing/ledger/customers"),
        fetch("/api/pricing/ledger/units"),
        fetch("/api/pricing/ledger/projects")
      ]);

      if (custRes.ok && unitRes.ok && projRes.ok) {
        const custData = await custRes.json();
        const unitData = await unitRes.json();
        const projData = await projRes.json();

        setCustomers(custData);
        setUnits(unitData);
        setProjects(projData);

        // Auto-select the first unit-customer combination if available
        if (unitData.length > 0) {
          const firstUnit = unitData[0];
          const firstCustomer = custData.find(c => c.id === firstUnit.customer_id);
          const firstProject = projData.find(p => p.id === firstUnit.project_id);
          
          if (firstCustomer) {
            const initialOpt = {
              unitId: firstUnit.id,
              unitNo: firstUnit.unit_no,
              customerId: firstCustomer.id,
              customerName: firstCustomer.name_applicant_1,
              customerCode: firstCustomer.customer_code,
              pan: firstCustomer.pan_no,
              projectName: firstProject?.name || "Unknown Project",
              label: `${firstCustomer.name_applicant_1} (${firstCustomer.customer_code})`,
            };
            setSelectedCustomer(initialOpt);
            setSearchQuery(initialOpt.label);
          }
        }
      } else {
        setError("Failed to fetch reference data.");
      }
    } catch (err) {
      setError("Error connecting to server: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLedger = async (unitId) => {
    if (!unitId) return;
    try {
      setIsLoading(true);
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const res = await axios.get(`/api/pricing/ledger/${unitId}?as_of_date=${todayStr}`);
      
      const data = res.data;
      setLedgerData(data.ledger_entries || []);
      
      if (selectedCustomer) {
        setSummaryInfo({
          project: selectedCustomer.projectName,
          unit: selectedCustomer.unitNo,
          customer: selectedCustomer.customerName,
          pan: selectedCustomer.pan,
          outstandingBalance: data.total_outstanding_balance,
        });
      }
    } catch (err) {
      setError("Error loading ledger: " + (err.response?.data?.detail || err.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/pricing/ledger/setup/seed-data", { method: "POST" });
      if (res.ok) {
        await fetchReferenceData();
        setError("");
      } else {
        setError("Failed to seed demo data.");
      }
    } catch (err) {
      setError("Error seeding data: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit manual transaction
  const handleTxSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) {
      alert("Please select a customer first.");
      return;
    }
    try {
      const payload = {
        unit_id: selectedCustomer.unitId,
        transaction_date: txForm.transaction_date,
        consideration_date: txForm.consideration_date,
        type: txForm.type,
        narration: txForm.narration,
        debit: parseFloat(txForm.debit || 0),
        credit: parseFloat(txForm.credit || 0),
      };

      const res = await fetch("/api/pricing/ledger/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowTransactionModal(false);
        setTxForm({
          transaction_date: format(new Date(), "yyyy-MM-dd"),
          consideration_date: format(new Date(), "yyyy-MM-dd"),
          type: "Receipt",
          narration: "",
          debit: "0.00",
          credit: "0.00",
        });
        fetchLedger(selectedCustomer.unitId);
      } else {
        const errData = await res.json();
        alert("Error: " + (errData.detail || "Failed to post transaction"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Submit milestone trigger
  const handleMilestoneSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) {
      alert("Please select a customer first.");
      return;
    }
    try {
      const payload = {
        unit_id: selectedCustomer.unitId,
        milestone_name: milestoneForm.milestone_name,
        installment_amount: parseFloat(milestoneForm.installment_amount || 0),
        tax_amount: parseFloat(milestoneForm.tax_amount || 0),
        transaction_date: milestoneForm.transaction_date,
        consideration_date: milestoneForm.consideration_date,
      };

      const res = await fetch("/api/pricing/ledger/milestone/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowMilestoneModal(false);
        setMilestoneForm({
          milestone_name: "",
          milestone_type: "construction",
          installment_amount: "",
          tax_amount: "",
          transaction_date: format(new Date(), "yyyy-MM-dd"),
          consideration_date: format(new Date(), "yyyy-MM-dd"),
        });
        fetchLedger(selectedCustomer.unitId);
      } else {
        const errData = await res.json();
        alert("Error: " + (errData.detail || "Failed to trigger milestone"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Run month-end overdue interest engine
  const handleInterestSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        year: parseInt(interestForm.year),
        month: parseInt(interestForm.month),
        annual_interest_rate: parseFloat(interestForm.annual_interest_rate || 12),
      };

      const res = await fetch("/api/pricing/ledger/interest/run-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setShowInterestModal(false);
        alert(
          `Overdue Interest Engine complete!\nPosted entries count: ${data.posted_interest_count}\n` +
            (data.details.length > 0
              ? data.details
                  .map((d) => `Unit: ${d.unit_no}, Interest: ₹${d.interest_amount.toLocaleString("en-IN")}`)
                  .join("\n")
              : "No units exceeded the minimum Rs. 100 threshold.")
        );
        if (selectedCustomer) {
          fetchLedger(selectedCustomer.unitId);
        }
      } else {
        const errData = await res.json();
        alert("Error: " + (errData.detail || "Failed to run interest engine"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Indian Rupee formatting with parenthesis for negative values
  const currencyFormatter = (params) => {
    const val = Number(params.value || 0);
    if (val === 0 && params.colDef?.field !== "net_balance") return "-";
    const absVal = Math.abs(val);
    const formatted = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(absVal);
    return val < 0 ? `(${formatted})` : formatted;
  };

  const dateFormatter = (params) => {
    if (!params.value) return "-";
    try {
      return format(new Date(params.value), "dd-MMM-yyyy");
    } catch (e) {
      return params.value;
    }
  };

  // Download PDF of a specific transaction
  const handleDownloadTransaction = (tx) => {
    if (!tx) return;
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Top branding header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(30, 96, 235); // #1e60eb Royal Blue
      doc.text("PropFin Platform", pageWidth / 2, 50, { align: "center" });

      doc.setFontSize(14);
      doc.setTextColor(71, 85, 105); // Slate 600
      doc.text(`${tx.type} Receipt / Statement`, pageWidth / 2, 72, { align: "center" });

      // Horizontal separator line
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.setLineWidth(1.5);
      doc.line(40, 90, pageWidth - 40, 90);

      // Core details
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59); // Slate 800
      
      let y = 130;
      const drawField = (label, val) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 50, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(val || "-"), 220, y);
        y += 24;
      };

      drawField("Project Name", selectedCustomer?.projectName);
      drawField("Unit Number", selectedCustomer?.unitNo);
      drawField("Customer Name", selectedCustomer?.customerName);
      drawField("PAN Number", selectedCustomer?.pan);
      drawField("Transaction ID", tx.id || "N/A (Virtual JIT Row)");
      drawField("Transaction Date", format(new Date(tx.transaction_date), "dd-MMM-yyyy"));
      drawField("Consideration Date", format(new Date(tx.consideration_date), "dd-MMM-yyyy"));
      drawField("Narration", tx.narration);

      if (Number(tx.debit) > 0) {
        drawField("Debit Amount", currencyFormatter({ value: tx.debit }));
      }
      if (Number(tx.credit) > 0) {
        drawField("Credit Amount", currencyFormatter({ value: tx.credit }));
      }

      drawField("Running Net Balance", currencyFormatter({ value: tx.net_balance }));

      // Signature Area
      y += 50;
      doc.setDrawColor(203, 213, 225); // Slate 300
      doc.line(50, y, 200, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Authorized Signatory", 50, y + 15);
      doc.setFont("helvetica", "normal");
      doc.text("PropFin Finance Department", 50, y + 28);

      // Save document
      doc.save(`PropFin_${tx.type}_${format(new Date(tx.transaction_date), "yyyyMMdd")}.pdf`);
    } catch (err) {
      alert("Error generating PDF: " + err.message);
    }
  };

  // Map units to customer options for searchable dropdown
  const customerOptions = units.map(unit => {
    const customer = customers.find(c => c.id === unit.customer_id);
    const project = projects.find(p => p.id === unit.project_id);
    return {
      unitId: unit.id,
      unitNo: unit.unit_no,
      customerId: customer?.id || "",
      customerName: customer?.name_applicant_1 || "Unassigned",
      customerCode: customer?.customer_code || "",
      pan: customer?.pan_no || "-",
      projectName: project?.name || "Unknown Project",
      label: `${customer?.name_applicant_1 || "Unassigned"} (${customer?.customer_code || "N/A"})`,
    };
  }).filter(opt => opt.customerId);

  // Filter options based on user text query
  const filteredOptions = customerOptions.filter(opt => {
    if (selectedCustomer && searchQuery === selectedCustomer.label) {
      return true;
    }
    return (
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.unitNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.projectName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // AG Grid Column Definitions
  const columnDefs = [
    {
      headerName: "Date",
      field: "transaction_date",
      valueFormatter: dateFormatter,
      sortable: true,
      filter: true,
      flex: 1,
      minWidth: 120,
    },
    {
      headerName: "Type",
      field: "type",
      sortable: true,
      filter: true,
      flex: 1,
      minWidth: 120,
      cellRenderer: (params) => {
        if (!params.data) return "-";
        const isPosted = params.data.is_posted;
        if (!isPosted) {
          return (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-300 shadow-sm animate-pulse uppercase tracking-wider">
              Provisional
            </span>
          );
        }
        
        const typeColors = {
          Installment: "bg-blue-50 text-blue-800 border-blue-200",
          Tax: "bg-purple-50 text-purple-800 border-purple-200",
          Receipt: "bg-emerald-50 text-emerald-800 border-emerald-200",
          Adjustment: "bg-amber-50 text-amber-800 border-amber-200",
          Interest: "bg-rose-50 text-rose-800 border-rose-200",
          TDS: "bg-indigo-50 text-indigo-800 border-indigo-200",
        };
        const colorClass = typeColors[params.value] || "bg-slate-50 text-slate-800 border-slate-200";
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
            {params.value}
          </span>
        );
      },
    },
    {
      headerName: "Consideration Date",
      field: "consideration_date",
      valueFormatter: dateFormatter,
      sortable: true,
      filter: true,
      flex: 1.1,
      minWidth: 150,
    },
    {
      headerName: "Narration",
      field: "narration",
      sortable: true,
      filter: true,
      flex: 2,
      minWidth: 250,
    },
    {
      headerName: "Debit",
      field: "debit",
      valueFormatter: currencyFormatter,
      type: "numericColumn",
      sortable: true,
      filter: true,
      flex: 1.2,
      minWidth: 130,
      cellClass: "font-mono text-right text-red-600",
    },
    {
      headerName: "Credit",
      field: "credit",
      valueFormatter: currencyFormatter,
      type: "numericColumn",
      sortable: true,
      filter: true,
      flex: 1.2,
      minWidth: 130,
      cellClass: "font-mono text-right text-emerald-600",
    },
    {
      headerName: "Net Amount",
      field: "net_balance",
      valueFormatter: currencyFormatter,
      type: "numericColumn",
      sortable: true,
      filter: true,
      flex: 1.5,
      minWidth: 155,
      cellClass: (params) => {
        const val = Number(params.value || params.data?.net_amount || 0);
        return `font-mono font-bold text-right ${val < 0 ? "text-emerald-700" : "text-slate-900"}`;
      },
    },
    {
      headerName: "Download",
      field: "id",
      sortable: false,
      filter: false,
      flex: 0.8,
      minWidth: 100,
      cellClass: "text-center flex items-center justify-center",
      cellRenderer: (params) => {
        const isPosted = params.data?.is_posted;
        if (!isPosted) return "-";
        return (
          <button
            onClick={() => handleDownloadTransaction(params.data)}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 transition-colors"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </button>
        );
      }
    }
  ];

  // Filter grid rows locally
  const filteredLedger = ledgerData.filter((tx) => {
    if (filterType === "ALL") return true;
    if (filterType === "Receipts") return tx.type === "Receipt" || tx.type === "TDS";
    if (filterType === "TDS") return tx.type === "TDS";
    if (filterType === "Installments") return tx.type === "Installment" || tx.type === "Tax";
    if (filterType === "Interest") return tx.type === "Interest" || tx.type === "Accrued_Interest";
    return true;
  });

  const getLedgerAuditSummary = () => {
    let principalMilestones = 0;
    let gstTaxes = 0;
    let interestPenalties = 0;
    let debitAdjustments = 0;
    
    let receiptsPaid = 0;
    let tdsCredits = 0;
    let creditAdjustments = 0;
    
    ledgerData.forEach(tx => {
      const type = tx.type;
      const debit = parseFloat(tx.debit || 0);
      const credit = parseFloat(tx.credit || 0);
      
      if (type === "Installment") {
        principalMilestones += debit;
      } else if (type === "Tax") {
        gstTaxes += debit;
      } else if (type === "Interest" || type === "Accrued_Interest") {
        interestPenalties += debit;
      } else if (type === "Adjustment") {
        debitAdjustments += debit;
        creditAdjustments += credit;
      } else if (type === "Receipt") {
        receiptsPaid += credit;
      } else if (type === "TDS") {
        tdsCredits += credit;
      }
    });

    const totalDebits = principalMilestones + gstTaxes + interestPenalties + debitAdjustments;
    const totalCredits = receiptsPaid + tdsCredits + creditAdjustments;
    const netBalance = totalDebits - totalCredits;

    return {
      principalMilestones,
      gstTaxes,
      interestPenalties,
      debitAdjustments,
      receiptsPaid,
      tdsCredits,
      creditAdjustments,
      totalDebits,
      totalCredits,
      netBalance
    };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 bg-slate-50/50 min-h-screen">
      {/* Custom styles override */}
      <style>{`
        /* AG Grid PropFin Accent Styles */
        .ag-theme-alpine {
          --ag-active-color: #2563eb;
          --ag-range-selection-border-color: #2563eb;
          --ag-selected-row-background-color: rgba(37, 99, 235, 0.04);
          --ag-row-hover-color: rgba(37, 99, 235, 0.015);
          --ag-font-family: inherit;
        }
        .ag-theme-alpine .ag-header {
          border-bottom: 2px solid #2563eb !important;
          background-color: #f8fafc !important;
        }
        .ag-theme-alpine .ag-header-cell-label {
          font-weight: 700;
          color: #475569;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ag-theme-alpine .ag-row {
          border-bottom-color: #e2e8f0;
        }
        .ag-theme-alpine .ag-header-cell:focus::after,
        .ag-theme-alpine .ag-header-cell-focus::after {
          border: 1px solid #2563eb !important;
        }
        .ag-theme-alpine .ag-cell-focus {
          border: 1px solid #2563eb !important;
          outline: none;
        }
        .accruing-interest-row {
          background-color: #fffbeb !important; /* amber-50 */
          color: #b45309 !important; /* amber-700 */
        }
        .accruing-interest-row .ag-cell {
          font-style: italic !important;
        }
      `}</style>

      {/* Header Accent Branding */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">CRM Ledger Report</h1>
          <p className="text-slate-500 mt-1">
            Real-time customer account financial statement with JIT accrued interest calculation and PDF exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowAdminTools(!showAdminTools)}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
          >
            <Database className="h-4 w-4 text-slate-500" />
            {showAdminTools ? "Hide Admin Panel" : "Show Admin Panel"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-800">System Notification</h3>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Collapsible Admin Tools section */}
      {showAdminTools && (
        <div className="bg-slate-100/50 p-4 rounded-xl border border-slate-200/85 flex flex-wrap gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
          {units.length === 0 ? (
            <button
              onClick={handleSeedData}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Database className="h-4 w-4" />
              Seed Demo Unit & Customer
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowTransactionModal(true)}
                disabled={!selectedCustomer}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Post Transaction
              </button>
              <button
                onClick={() => setShowMilestoneModal(true)}
                disabled={!selectedCustomer}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Trigger Milestone
              </button>
              <button
                onClick={() => setShowInterestModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 border-2 border-primary text-primary bg-white rounded-md text-sm font-medium hover:bg-primary/5 transition-colors shadow-sm"
                title="Run overdue interest engine manually"
              >
                <Play className="h-4 w-4 fill-current" />
                Run Interest Cron Engine
              </button>
            </>
          )}
        </div>
      )}

      {/* Select Customer Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <label className="text-xs font-bold uppercase text-slate-400">Select Customer</label>
        <div className="relative max-w-2xl" ref={dropdownRef}>
          <input
            type="text"
            placeholder="Search customer name, customer code, or unit number..."
            value={searchQuery}
            onFocus={() => setDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setDropdownOpen(true);
            }}
            className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-3.5 pr-10 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <ChevronDown className="h-5 w-5 text-slate-400" />
          </div>
          
          {dropdownOpen && (
            <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="py-4 px-4 text-sm text-slate-500 text-center">
                  No matching customers or units found
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.unitId}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(opt);
                      setSearchQuery(opt.label);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0 ${
                      selectedCustomer?.unitId === opt.unitId ? "bg-primary/[0.04] text-primary font-bold" : "text-slate-700"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{opt.customerName}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{opt.customerCode} • {opt.projectName}</div>
                    </div>
                    <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-600">
                      Unit {opt.unitNo}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards Middle Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Project Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Project</span>
            <h3 className="text-base font-bold text-slate-800 mt-1 truncate" title={summaryInfo?.project || "-"}>
              {summaryInfo?.project || "-"}
            </h3>
          </div>
        </div>

        {/* Unit Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Unit</span>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              {summaryInfo?.unit || "-"}
            </h3>
          </div>
        </div>

        {/* Customer Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Customer</span>
            <h3 className="text-base font-bold text-slate-800 mt-1 truncate" title={summaryInfo?.customer || "-"}>
              {summaryInfo?.customer || "-"}
            </h3>
          </div>
        </div>

        {/* PAN Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">PAN</span>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              {summaryInfo?.pan || "-"}
            </h3>
          </div>
        </div>

        {/* Outstanding Balance Card */}
        <div className="bg-white p-5 rounded-xl border border-primary/30 bg-primary/[0.015] shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-primary tracking-wider block">Outstanding Balance</span>
            <h3 className="text-lg font-black mt-1 text-primary">
              {summaryInfo ? currencyFormatter({ value: summaryInfo.outstandingBalance, colDef: { field: "net_balance" } }) : "-"}
            </h3>
          </div>
        </div>
      </div>

      {/* Filter and Grid Content */}
      {selectedCustomer ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-600">Filter View:</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                {["ALL", "Installments", "Receipts", "TDS", "Interest"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterType(f)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      filterType === f
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing {filteredLedger.length} of {ledgerData.length} entries
            </div>
          </div>

          {/* AG Grid rendering with loading overlay */}
          <div className="relative ag-theme-alpine w-full h-[450px]">
            {isLoading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
                <p className="text-sm font-bold text-primary">Calculating Real-Time Ledger...</p>
              </div>
            )}
            <AgGridReact
              rowData={filteredLedger}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                suppressMovable: true,
              }}
              rowSelection="single"
              animateRows={true}
              rowClassRules={{
                "accruing-interest-row": (params) => params.data && params.data.is_posted === false,
              }}
            />
          </div>

          {/* LEDGER ACCOUNTING AUDIT & SUMMARY CARD */}
          {(() => {
            const summary = getLedgerAuditSummary();
            const formatInr = (val) => {
              const absVal = Math.abs(val);
              const formatted = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(absVal);
              return val < 0 ? `(${formatted})` : formatted;
            };

            return (
              <div className="p-6 border-t border-slate-200 bg-slate-50/50 space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between pb-4 border-b border-slate-200 gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Ledger Accounting Audit & Summary</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pro-rata calculation summary based on standard Indian real estate taxation norms.
                    </p>
                  </div>
                  <div>
                    {summary.netBalance > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 shadow-sm animate-in fade-in duration-300">
                        <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse"></span>
                        Debt Balance: {formatInr(summary.netBalance)}
                      </span>
                    ) : summary.netBalance < 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm animate-in fade-in duration-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                        Advance/Credit: {formatInr(summary.netBalance)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 shadow-sm animate-in fade-in duration-300">
                        <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                        Fully Settled: ₹0.00
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Column 1: Debits */}
                  <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Builder Charges (Debits)</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Construction Milestones:</span>
                        <span className="font-mono text-slate-800">{formatInr(summary.principalMilestones)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">GST Taxes (5% / 18%):</span>
                        <span className="font-mono text-slate-800">{formatInr(summary.gstTaxes)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Late Payment Interest:</span>
                        <span className="font-mono text-red-600">{formatInr(summary.interestPenalties)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Other Adjustments:</span>
                        <span className="font-mono text-slate-800">{formatInr(summary.debitAdjustments)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-bold">
                        <span className="text-slate-700">Total Demands:</span>
                        <span className="font-mono text-slate-900">{formatInr(summary.totalDebits)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Credits */}
                  <div className="space-y-3 bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Client Payments (Credits)</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Wire/Cheque Receipts:</span>
                        <span className="font-mono text-emerald-600">{formatInr(summary.receiptsPaid)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">TDS Credits Applied:</span>
                        <span className="font-mono text-emerald-600">{formatInr(summary.tdsCredits)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Approved Waivers / Credits:</span>
                        <span className="font-mono text-emerald-600">{formatInr(summary.creditAdjustments)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-bold">
                        <span className="text-slate-700">Total Credits:</span>
                        <span className="font-mono text-slate-900">{formatInr(summary.totalCredits)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Audit Narrative */}
                  <div className="flex flex-col justify-between bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Audit Narrative</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {summary.netBalance > 0 ? (
                          <>
                            The customer currently owes an outstanding balance of <strong className="text-rose-700 font-bold">{formatInr(summary.netBalance)}</strong> to the builder. This indicates an active debt position. Please check overdue days for outstanding construction milestones, as penalty interest calculations continue to accrue on unpaid principal.
                          </>
                        ) : summary.netBalance < 0 ? (
                          <>
                            The customer has an advance/credit balance of <strong className="text-emerald-700 font-bold">{formatInr(summary.netBalance)}</strong>. No outstanding debt is present, and no delayed payment interest is accruing on this account.
                          </>
                        ) : (
                          <>
                            This account is fully reconciled. The total customer payments and credits exactly cover the total demands levied by the builder. The running net balance is perfectly settled at <strong className="text-slate-800 font-bold">₹0.00</strong>.
                          </>
                        )}
                      </p>
                      {summary.interestPenalties > 0 && (
                        <p className="text-[11px] text-amber-700 bg-amber-50/50 border border-amber-200 rounded p-2 mt-2 leading-relaxed font-semibold">
                          Note on Interest Incurred: Overdue interest penalties totaling {formatInr(summary.interestPenalties)} have been incurred due to delays between milestone consideration dates and actual customer receipts.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <p className="text-slate-500 font-medium">Select a customer above to view their real-time ledger report.</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. MANUAL TRANSACTION MODAL */}
      {/* ========================================================================= */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-primary text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">Post Manual Transaction</h3>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="text-white/80 hover:text-white text-xl font-bold font-mono"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleTxSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tx Date</label>
                  <input
                    type="date"
                    required
                    value={txForm.transaction_date}
                    onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Consideration Date</label>
                  <input
                    type="date"
                    required
                    value={txForm.consideration_date}
                    onChange={(e) => setTxForm({ ...txForm, consideration_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Transaction Type</label>
                <select
                  value={txForm.type}
                  onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Receipt">Receipt (Credit payment - FIFO waterfall)</option>
                  <option value="TDS">TDS (Tax Deducted - Credit payment)</option>
                  <option value="Adjustment">Adjustment (Manual ledger patch)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Narration description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cleared cheque #821191 for installment 2"
                  value={txForm.narration}
                  onChange={(e) => setTxForm({ ...txForm, narration: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Debit (Amt Owed)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={txForm.debit}
                    onChange={(e) => setTxForm({ ...txForm, debit: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary text-right font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Credit (Amt Paid)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={txForm.credit}
                    onChange={(e) => setTxForm({ ...txForm, credit: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary text-right font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MILESTONE MODAL */}
      {/* ========================================================================= */}
      {showMilestoneModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">Trigger Construction Milestone</h3>
              <button
                onClick={() => setShowMilestoneModal(false)}
                className="text-white/80 hover:text-white text-xl font-bold font-mono"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleMilestoneSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Milestone Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Completion of foundation works"
                  value={milestoneForm.milestone_name}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, milestone_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Milestone Type</label>
                <select
                  value={milestoneForm.milestone_type}
                  onChange={(e) => handleMilestoneFormChange({ milestone_type: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary font-semibold"
                >
                  <option value="construction">Core Construction (5% GST - 2.5% CGST + 2.5% SGST)</option>
                  <option value="services">Services & Amenities (18% GST - 9% CGST + 9% SGST)</option>
                  <option value="security">Security Deposits (0% GST - Exempt)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Installment Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="2500000.00"
                    value={milestoneForm.installment_amount}
                    onChange={(e) => handleMilestoneFormChange({ installment_amount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary text-right font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tax Amount (GST)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="125000.00"
                    value={milestoneForm.tax_amount}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, tax_amount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary text-right font-mono"
                  />
                  {parseFloat(milestoneForm.tax_amount || 0) > 0 && (
                    <div className="text-[9px] text-slate-400 font-mono text-right mt-1">
                      CGST (50%): ₹{(parseFloat(milestoneForm.tax_amount) / 2).toFixed(2)} | SGST (50%): ₹{(parseFloat(milestoneForm.tax_amount) / 2).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Posting Date</label>
                  <input
                    type="date"
                    required
                    value={milestoneForm.transaction_date}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, transaction_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Consideration Date</label>
                  <input
                    type="date"
                    required
                    value={milestoneForm.consideration_date}
                    onChange={(e) => setMilestoneForm({ ...milestoneForm, consideration_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMilestoneModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors text-sm font-medium shadow-sm"
                >
                  Post Debits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. INTEREST CRON MODAL */}
      {/* ========================================================================= */}
      {showInterestModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border-b border-slate-200 text-slate-800 p-4 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <Play className="h-5 w-5 text-primary fill-current" />
                Trigger Overdue Interest Calculation
              </h3>
              <button
                onClick={() => setShowInterestModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold font-mono"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleInterestSubmit} className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                This triggers Algorithm B to calculate penalty interest on overdue principal basic amounts. It checks interest daily rates inside the target month and posts a ledger entry on month-end if interest sum &ge; Rs. 100.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Target Year</label>
                  <input
                    type="number"
                    required
                    value={interestForm.year}
                    onChange={(e) => setInterestForm({ ...interestForm, year: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary font-mono text-center"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Target Month (1-12)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={interestForm.month}
                    onChange={(e) => setInterestForm({ ...interestForm, month: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary font-mono text-center"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Annual Penalty Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={interestForm.annual_interest_rate}
                  onChange={(e) => setInterestForm({ ...interestForm, annual_interest_rate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary text-right font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowInterestModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm flex items-center gap-1"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Run Calculation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
