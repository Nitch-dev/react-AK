import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { FileText, Users, Settings, Building2, Upload, Package, DollarSign, CreditCard, Calculator, History } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const navItems = [
    { name: "Invoices", icon: FileText, path: "Invoices" },
    { name: "Sales", icon: Package, path: "Sales" },
    { name: "Sales Import", icon: Upload, path: "SalesImport" },
    { name: "Historical Import", icon: History, path: "HistoricalImport" },
    { name: "GST", icon: Calculator, path: "GST" },
    { name: "Payment Tracker", icon: DollarSign, path: "PaymentTracker" },
    { name: "Payment Import", icon: CreditCard, path: "PaymentImport" },
    { name: "Settings", icon: Settings, path: "Settings" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-md">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">TradeFlow Pro</h1>
                <p className="text-xs text-slate-500">Premium Business Suite</p>
              </div>
            </div>
            <div className="flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path;
                return (
                  <Link
                    key={item.path}
                    to={createPageUrl(item.path)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
                      isActive
                        ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-600 hover:bg-white hover:shadow-md"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}