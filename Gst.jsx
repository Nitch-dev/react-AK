import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, Calculator, FileText, ArrowLeft, Search, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as XLSX from 'xlsx';
import { formatIndianCurrency } from "../components/utils/formatCurrency";

export default function GSTPage() {
  const [gstRecords, setGSTRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [viewMode, setViewMode] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingMargin, setEditingMargin] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ field: null, direction: "asc" });
  const [monthlyStatus, setMonthlyStatus] = useState("draft");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadGSTRecords();
  }, []);

  useEffect(() => {
    if (viewMode === "monthly" && selectedMonth) {
      loadMonthlyStatus();
    }
  }, [viewMode, selectedMonth, selectedYear]);

  const loadGSTRecords = async () => {
    setLoading(true);
    const data = await base44.entities.GST.list('-created_date');
    setGSTRecords(data);
    setLoading(false);
  };

  const loadMonthlyStatus = async () => {
    const statusData = await base44.entities.GSTMonthlyStatus.filter({
      year: parseInt(selectedYear),
      month: selectedMonth
    });
    
    if (statusData.length > 0) {
      setMonthlyStatus(statusData[0].status);
    } else {
      setMonthlyStatus("draft");
    }
  };

  const handleMonthlyStatusChange = async (newStatus) => {
    setMonthlyStatus(newStatus);
    
    const existingStatus = await base44.entities.GSTMonthlyStatus.filter({
      year: parseInt(selectedYear),
      month: selectedMonth
    });
    
    if (existingStatus.length > 0) {
      await base44.entities.GSTMonthlyStatus.update(existingStatus[0].id, {
        status: newStatus
      });
    } else {
      await base44.entities.GSTMonthlyStatus.create({
        year: parseInt(selectedYear),
        month: selectedMonth,
        status: newStatus
      });
    }
  };

  const availableYears = [...new Set(gstRecords.map(r => r.year))].sort((a, b) => b - a);
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthlyData = gstRecords.filter(r => r.year === parseInt(selectedYear));

  const monthlySummary = [];
  for (let m = 1; m <= 12; m++) {
    const monthRecords = monthlyData.filter(r => r.month === m);
    if (monthRecords.length > 0) {
      monthlySummary.push({
        month: m,
        monthName: monthNames[m - 1],
        count: monthRecords.length,
        totalSale: monthRecords.reduce((sum, r) => sum + r.sale_amount, 0),
        totalPurchase: monthRecords.reduce((sum, r) => sum + r.purchase_amount, 0),
        totalGST: monthRecords.reduce((sum, r) => sum + r.gst_amount, 0)
      });
    }
  }

  const filteredRecords = gstRecords.filter(record => {
    if (viewMode === "monthly" && selectedMonth) {
      if (record.year !== parseInt(selectedYear) || record.month !== selectedMonth) return false;
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !record.barcode?.toLowerCase().includes(search) &&
        !record.description?.toLowerCase().includes(search) &&
        !record.colour?.toLowerCase().includes(search) &&
        !record.size?.toLowerCase().includes(search)
      ) return false;
    }

    for (const [field, value] of Object.entries(filters)) {
      if (value && record[field]?.toString().toLowerCase() !== value.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (!sortConfig.field) return 0;
    const aVal = a[sortConfig.field];
    const bVal = b[sortConfig.field];
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const handleMarginUpdate = async (recordId, newMargin) => {
    const record = gstRecords.find(r => r.id === recordId);
    if (!record) return;

    const marginValue = parseFloat(newMargin);
    if (isNaN(marginValue)) return;

    const newPurchaseAmount = record.sale_amount - marginValue;
    const newGSTAmount = marginValue * 0.18;

    await base44.entities.GST.update(recordId, {
      margin_taxable: marginValue,
      purchase_amount: newPurchaseAmount,
      gst_amount: newGSTAmount
    });

    setEditingId(null);
    setEditingMargin("");
    loadGSTRecords();
  };

  const exportToExcel = () => {
    const data = sortedRecords.map((r, index) => ({
      "SR No": index + 1,
      "CDC Barcode": r.barcode,
      "Description": r.description,
      "Colour": r.colour,
      "Size": r.size,
      "Sale Amount": r.sale_amount,
      "Margin Taxable": r.margin_taxable,
      "Purchase Amount": r.purchase_amount,
      "GST Amount": r.gst_amount
    }));

    const totals = {
      "SR No": "",
      "CDC Barcode": "",
      "Description": "",
      "Colour": "",
      "Size": "TOTAL",
      "Sale Amount": totalSaleAmount,
      "Margin Taxable": sortedRecords.reduce((sum, r) => sum + r.margin_taxable, 0),
      "Purchase Amount": totalPurchaseAmount,
      "GST Amount": totalGST
    };

    data.push(totals);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GST Records");
    
    const fileName = `GST_${selectedYear}_${monthNames[selectedMonth - 1]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  const openMonthView = (month) => {
    setSelectedMonth(month);
    setViewMode("monthly");
    setSearchTerm("");
    setFilters({});
    setSortConfig({ field: null, direction: "asc" });
  };

  const backToDashboard = () => {
    setViewMode("dashboard");
    setSelectedMonth(null);
    setSearchTerm("");
    setFilters({});
  };

  const handleDeleteGST = async (record) => {
    setDeleting(true);
    try {
      await base44.entities.GST.delete(record.id);
      await base44.entities.Sales.filter({ barcode: record.barcode }).then(async (records) => {
        for (const sale of records) {
          await base44.entities.Sales.delete(sale.id);
        }
      });
      await base44.entities.PaymentTracker.filter({ barcode: record.barcode }).then(async (records) => {
        for (const payment of records) {
          await base44.entities.PaymentTracker.delete(payment.id);
        }
      });
      await loadGSTRecords();
    } catch (error) {
      console.error('Error deleting GST record:', error);
      alert('Error deleting GST record: ' + error.message);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const totalSaleAmount = sortedRecords.reduce((sum, r) => sum + r.sale_amount, 0);
  const totalPurchaseAmount = sortedRecords.reduce((sum, r) => sum + r.purchase_amount, 0);
  const totalGST = sortedRecords.reduce((sum, r) => sum + r.gst_amount, 0);

  const statusColors = {
    draft: "bg-slate-100 text-slate-700 border border-slate-200",
    working: "bg-blue-50 text-blue-700 border border-blue-200",
    filed: "bg-emerald-50 text-emerald-700 border border-emerald-200"
  };

  const yearTotalSale = monthlyData.reduce((sum, r) => sum + r.sale_amount, 0);
  const yearTotalPurchase = monthlyData.reduce((sum, r) => sum + r.purchase_amount, 0);
  const yearTotalGST = monthlyData.reduce((sum, r) => sum + r.gst_amount, 0);

  if (viewMode === "monthly" && selectedMonth) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-full mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={backToDashboard} className="border-2 border-slate-300 hover:bg-slate-50 transition-all shadow-md">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">{monthNames[selectedMonth - 1]} {selectedYear}</h1>
                <p className="text-slate-500 text-sm mt-1">GST Records & Details</p>
              </div>
            </div>
            <Button onClick={exportToExcel} disabled={sortedRecords.length === 0} className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-600/30">
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </div>

          <Card className="mb-6 shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search barcode, description, colour, or size..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">Monthly Status:</span>
                  <Select value={monthlyStatus} onValueChange={handleMonthlyStatusChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="working">Working</SelectItem>
                      <SelectItem value="filed">Filed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md border border-blue-200">
                    <p className="font-bold text-xl text-blue-700">{formatIndianCurrency(totalSaleAmount)}</p>
                    <p className="text-xs text-blue-600 font-medium mt-1">Sale Amount</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-md border border-purple-200">
                    <p className="font-bold text-xl text-purple-700">{formatIndianCurrency(totalPurchaseAmount)}</p>
                    <p className="text-xs text-purple-600 font-medium mt-1">Purchase</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl shadow-md border border-emerald-200">
                    <p className="font-bold text-xl text-emerald-700">{formatIndianCurrency(totalGST)}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-1">GST Amount</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-semibold">
                        <button onClick={() => handleSort("sr_no")} className="flex items-center gap-1">
                          SR No
                          {sortConfig.field === "sr_no" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-left p-3 font-semibold">
                        <button onClick={() => handleSort("sr_no")} className="flex items-center gap-1">
                          Barcode
                          {sortConfig.field === "sr_no" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-left p-3 font-semibold">
                        <button onClick={() => handleSort("description")} className="flex items-center gap-1">
                          Description
                          {sortConfig.field === "description" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-left p-3 font-semibold">
                        <button onClick={() => handleSort("colour")} className="flex items-center gap-1">
                          Colour
                          {sortConfig.field === "colour" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-left p-3 font-semibold">
                        <button onClick={() => handleSort("size")} className="flex items-center gap-1">
                          Size
                          {sortConfig.field === "size" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-right p-3 font-semibold">
                        <button onClick={() => handleSort("sale_amount")} className="flex items-center gap-1 ml-auto">
                          Sale Amount
                          {sortConfig.field === "sale_amount" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-right p-3 font-semibold">
                        <button onClick={() => handleSort("margin_taxable")} className="flex items-center gap-1 ml-auto">
                          Margin
                          {sortConfig.field === "margin_taxable" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-right p-3 font-semibold">
                        <button onClick={() => handleSort("purchase_amount")} className="flex items-center gap-1 ml-auto">
                          Purchase
                          {sortConfig.field === "purchase_amount" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-right p-3 font-semibold">
                        <button onClick={() => handleSort("gst_amount")} className="flex items-center gap-1 ml-auto">
                          GST
                          {sortConfig.field === "gst_amount" ? (
                            sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : <ArrowUpDown className="w-3 h-3 text-gray-400" />}
                        </button>
                      </th>
                      <th className="text-center p-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.map((record, index) => (
                      <tr key={record.id} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="p-3">{index + 1}</td>
                        <td className="p-3 font-mono text-xs">{record.barcode}</td>
                        <td className="p-3">{record.description}</td>
                        <td className="p-3">{record.colour}</td>
                        <td className="p-3">{record.size}</td>
                        <td className="text-right p-3 font-semibold">{formatIndianCurrency(record.sale_amount)}</td>
                        <td className="text-right p-3">
                          {editingId === record.id ? (
                            <div className="flex gap-1 justify-end">
                              <Input
                                type="number"
                                value={editingMargin}
                                onChange={(e) => setEditingMargin(e.target.value)}
                                className="w-24 h-8 text-right"
                                autoFocus
                              />
                              <Button size="sm" className="h-8" onClick={() => handleMarginUpdate(record.id, editingMargin)}>
                                Save
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(record.id);
                                setEditingMargin(record.margin_taxable.toString());
                              }}
                              className="text-blue-600 hover:underline font-semibold"
                            >
                              {formatIndianCurrency(record.margin_taxable)}
                            </button>
                          )}
                        </td>
                        <td className="text-right p-3">{formatIndianCurrency(record.purchase_amount)}</td>
                        <td className="text-right p-3 font-semibold text-green-600">{formatIndianCurrency(record.gst_amount)}</td>
                        <td className="text-center p-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(record)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold border-t-2 sticky bottom-0">
                      <td colSpan="5" className="p-3 text-right">TOTAL ({sortedRecords.length} records)</td>
                      <td className="text-right p-3">{formatIndianCurrency(totalSaleAmount)}</td>
                      <td className="text-right p-3">{formatIndianCurrency(sortedRecords.reduce((sum, r) => sum + r.margin_taxable, 0))}</td>
                      <td className="text-right p-3">{formatIndianCurrency(totalPurchaseAmount)}</td>
                      <td className="text-right p-3 text-green-600">{formatIndianCurrency(totalGST)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete GST Record</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this GST record (Barcode: {deleteConfirm?.barcode})? 
                  This will also delete associated Sales and Payment Tracker entries. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleDeleteGST(deleteConfirm)}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">GST Dashboard</h1>
          <p className="text-slate-500 mt-1">Track and manage GST records</p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <Card className="shadow-xl border-0 bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-2xl transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Total Sale Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-blue-900">{formatIndianCurrency(yearTotalSale)}</p>
                  <p className="text-xs text-blue-600 mt-1 font-medium">{monthlyData.length} items</p>
                </div>
                <div className="p-3 bg-blue-200/50 rounded-xl">
                  <TrendingUp className="w-8 h-8 text-blue-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-gradient-to-br from-purple-50 to-purple-100 hover:shadow-2xl transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Total Purchase Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-purple-900">{formatIndianCurrency(yearTotalPurchase)}</p>
                  <p className="text-xs text-purple-600 mt-1 font-medium">After margin deduction</p>
                </div>
                <div className="p-3 bg-purple-200/50 rounded-xl">
                  <Calculator className="w-8 h-8 text-purple-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-gradient-to-br from-emerald-50 to-emerald-100 hover:shadow-2xl transition-all">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Total GST (18%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-emerald-900">{formatIndianCurrency(yearTotalGST)}</p>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">On taxable margin</p>
                </div>
                <div className="p-3 bg-emerald-200/50 rounded-xl">
                  <TrendingUp className="w-8 h-8 text-emerald-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
          <CardContent className="p-4">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-48 border-2">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-500">Loading GST records...</p>
            </CardContent>
          </Card>
        ) : monthlySummary.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Calculator className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No GST records found</h3>
              <p className="text-gray-500">Import sales data to generate GST records</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-slate-800">Monthly Summary - {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left p-3 font-semibold">Month</th>
                      <th className="text-center p-3 font-semibold">Records</th>
                      <th className="text-right p-3 font-semibold">Sale Amount</th>
                      <th className="text-right p-3 font-semibold">Purchase Amount</th>
                      <th className="text-right p-3 font-semibold">GST Amount</th>
                      <th className="text-center p-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((summary, index) => {
                      const monthStatus = monthlyStatus;
                      return (
                        <tr key={summary.month} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              {summary.monthName}
                            </div>
                          </td>
                          <td className="text-center p-3">{summary.count}</td>
                          <td className="text-right p-3">{formatIndianCurrency(summary.totalSale)}</td>
                          <td className="text-right p-3">{formatIndianCurrency(summary.totalPurchase)}</td>
                          <td className="text-right p-3 font-semibold text-green-600">{formatIndianCurrency(summary.totalGST)}</td>
                          <td className="text-center p-3">
                            <Button size="sm" onClick={() => openMonthView(summary.month)} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all">
                              View Details
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}