import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, DollarSign, TrendingUp, AlertCircle, ChevronDown, ChevronRight, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";

export default function PaymentTrackerPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedDates, setExpandedDates] = useState(new Set());
  const [invoiceMap, setInvoiceMap] = useState({});

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    const [paymentsData, invoiceItems, invoices] = await Promise.all([
      base44.entities.PaymentTracker.list('-sale_date'),
      base44.entities.InvoiceItem.list(),
      base44.entities.Invoice.list()
    ]);
    
    const invoiceIdMap = {};
    invoices.forEach(inv => {
      invoiceIdMap[inv.id] = inv.invoice_number;
    });
    
    const barcodeToInvoiceNumber = {};
    invoiceItems.forEach(item => {
      if (item.barcode && item.invoice_id) {
        barcodeToInvoiceNumber[item.barcode] = invoiceIdMap[item.invoice_id];
      }
    });
    
    setInvoiceMap(barcodeToInvoiceNumber);
    setPayments(paymentsData);
    setLoading(false);
  };

  const today = startOfDay(new Date());

  const groupedByDate = useMemo(() => {
    const groups = {};
    payments.forEach(payment => {
      const dateKey = payment.sale_date || 'No Date';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(payment);
    });
    return groups;
  }, [payments]);

  const filteredGroups = useMemo(() => {
    const filtered = {};
    Object.keys(groupedByDate).forEach(dateKey => {
      const items = groupedByDate[dateKey].filter(payment => {
        const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
        const matchesSearch = !searchTerm || 
          payment.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoiceMap[payment.barcode]?.toLowerCase().includes(searchTerm.toLowerCase());
        
        return matchesStatus && matchesSearch;
      });
      if (items.length > 0) {
        filtered[dateKey] = items;
      }
    });
    return filtered;
  }, [groupedByDate, statusFilter, searchTerm, invoiceMap]);

  const totalSaleAmount = payments.reduce((sum, p) => sum + (parseFloat(p.sale_amount) || 0), 0);
  const totalReceivedAmount = payments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
  const totalPendingBalance = payments.reduce((sum, p) => sum + (parseFloat(p.balance) || 0), 0);

  const overdueCount = payments.filter(p => {
    if (!p.sale_date || p.status === 'paid') return false;
    return isBefore(parseISO(p.sale_date), today);
  }).length;

  const toggleDate = (dateKey) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(dateKey)) {
      newExpanded.delete(dateKey);
    } else {
      newExpanded.add(dateKey);
    }
    setExpandedDates(newExpanded);
  };

  const expandAll = () => {
    setExpandedDates(new Set(Object.keys(filteredGroups)));
  };

  const collapseAll = () => {
    setExpandedDates(new Set());
  };

  const statusColors = {
    unpaid: "bg-red-50 text-red-700 border border-red-200",
    partial: "bg-amber-50 text-amber-700 border border-amber-200",
    paid: "bg-emerald-50 text-emerald-700 border border-emerald-200"
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Executive Payment Dashboard</h1>
          <p className="text-slate-600 mt-2 text-lg">Real-time receivables overview and collection analytics</p>
        </div>

        <div className="grid grid-cols-4 gap-5 mb-6">
          <Card className="shadow-lg border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:shadow-xl transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/20 rounded-lg backdrop-blur">
                  <DollarSign className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Total Receivable</p>
              </div>
              <p className="text-3xl font-bold mb-1">₹{(totalSaleAmount / 100000).toFixed(2)}L</p>
              <p className="text-xs opacity-80">{payments.length} transactions</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:shadow-xl transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/20 rounded-lg backdrop-blur">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Collected</p>
              </div>
              <p className="text-3xl font-bold mb-1">₹{(totalReceivedAmount / 100000).toFixed(2)}L</p>
              <p className="text-xs opacity-80">
                {totalSaleAmount > 0 ? ((totalReceivedAmount / totalSaleAmount) * 100).toFixed(1) : 0}% collection rate
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0 bg-gradient-to-br from-red-500 to-red-600 text-white hover:shadow-xl transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/20 rounded-lg backdrop-blur">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Outstanding</p>
              </div>
              <p className="text-3xl font-bold mb-1">₹{(totalPendingBalance / 100000).toFixed(2)}L</p>
              <p className="text-xs opacity-80">
                {totalSaleAmount > 0 ? ((totalPendingBalance / totalSaleAmount) * 100).toFixed(1) : 0}% pending
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white hover:shadow-xl transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/20 rounded-lg backdrop-blur">
                  <Clock className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Overdue Items</p>
              </div>
              <p className="text-3xl font-bold mb-1">{overdueCount}</p>
              <p className="text-xs opacity-80">Require immediate attention</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 shadow-lg border-0 bg-white/90 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by barcode or details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-slate-300 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40 border-slate-300">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>

              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">
                  Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">
                  Collapse All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="shadow-lg">
            <CardContent className="p-12 text-center">
              <div className="animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mx-auto mb-4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto"></div>
              </div>
            </CardContent>
          </Card>
        ) : Object.keys(filteredGroups).length === 0 ? (
          <Card className="shadow-lg border-0">
            <CardContent className="p-16 text-center">
              <Calendar className="w-20 h-20 mx-auto text-slate-300 mb-6" />
              <h3 className="text-2xl font-bold text-slate-700 mb-2">No payment records found</h3>
              <p className="text-slate-500 text-lg">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your filters to see more results' 
                  : 'Import sales data to start tracking payments'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.keys(filteredGroups).sort((a, b) => {
              if (a === 'No Date') return 1;
              if (b === 'No Date') return -1;
              return new Date(b) - new Date(a);
            }).map(dateKey => {
              const items = filteredGroups[dateKey];
              const dateSaleAmount = items.reduce((sum, p) => sum + (parseFloat(p.sale_amount) || 0), 0);
              const dateReceivedAmount = items.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
              const dateBalance = items.reduce((sum, p) => sum + (parseFloat(p.balance) || 0), 0);
              const collectionPercentage = dateSaleAmount > 0 ? (dateReceivedAmount / dateSaleAmount) * 100 : 0;
              const isExpanded = expandedDates.has(dateKey);
              
              const isOverdue = dateKey !== 'No Date' && isBefore(parseISO(dateKey), today) && dateBalance > 0;
              const unpaidCount = items.filter(i => i.status === 'unpaid').length;
              const partialCount = items.filter(i => i.status === 'partial').length;
              const paidCount = items.filter(i => i.status === 'paid').length;

              return (
                <Card key={dateKey} className={`shadow-lg border-0 overflow-hidden transition-all ${isOverdue ? 'ring-2 ring-red-400 ring-opacity-50' : ''}`}>
                  <div 
                    className={`p-5 cursor-pointer hover:bg-slate-50/50 transition-all ${isOverdue ? 'bg-red-50/50' : 'bg-gradient-to-r from-slate-50 to-white'}`}
                    onClick={() => toggleDate(dateKey)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-600" />}
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-slate-800">
                              {dateKey === 'No Date' ? 'Unspecified Date' : format(parseISO(dateKey), 'dd MMMM yyyy')}
                            </h3>
                            {isOverdue && (
                              <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">
                                <Clock className="w-3 h-3 mr-1 inline" />
                                OVERDUE
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            {items.length} transaction{items.length !== 1 ? 's' : ''} • 
                            <span className="text-emerald-600 font-medium ml-2">{paidCount} paid</span>
                            {partialCount > 0 && <span className="text-amber-600 font-medium ml-2">{partialCount} partial</span>}
                            {unpaidCount > 0 && <span className="text-red-600 font-medium ml-2">{unpaidCount} unpaid</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Sale</p>
                          <p className="text-xl font-bold text-slate-800">₹{dateSaleAmount.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Collected</p>
                          <p className="text-xl font-bold text-emerald-600">₹{dateReceivedAmount.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Pending</p>
                          <p className="text-xl font-bold text-red-600">₹{dateBalance.toLocaleString('en-IN')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">Collection Progress</span>
                        <span className="font-bold text-slate-800">{collectionPercentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={collectionPercentage} className="h-3 bg-slate-200" />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-100 border-b border-slate-200">
                            <tr>
                              <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Invoice #</th>
                              <th className="text-left p-3 text-xs font-semibold text-slate-600 uppercase">Barcode</th>
                              <th className="text-right p-3 text-xs font-semibold text-slate-600 uppercase">Sale Amt</th>
                              <th className="text-right p-3 text-xs font-semibold text-slate-600 uppercase">Received</th>
                              <th className="text-right p-3 text-xs font-semibold text-slate-600 uppercase">Balance</th>
                              <th className="text-center p-3 text-xs font-semibold text-slate-600 uppercase">Payment Date</th>
                              <th className="text-center p-3 text-xs font-semibold text-slate-600 uppercase">Status</th>
                              <th className="p-3 text-xs font-semibold text-slate-600 uppercase">Progress</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((payment, index) => {
                              const itemProgress = payment.sale_amount > 0 
                                ? ((parseFloat(payment.received_amount) || 0) / (parseFloat(payment.sale_amount) || 1)) * 100 
                                : 0;
                              return (
                                <tr key={payment.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                  <td className="p-3">
                                    <span className="text-sm font-bold text-blue-700">{invoiceMap[payment.barcode] || '—'}</span>
                                  </td>
                                  <td className="p-3">
                                    <span className="font-mono text-sm font-semibold text-slate-800">{payment.barcode}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className="font-semibold text-sm text-slate-800">₹{(parseFloat(payment.sale_amount) || 0).toLocaleString('en-IN')}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className="text-sm text-emerald-700 font-bold">₹{(parseFloat(payment.received_amount) || 0).toLocaleString('en-IN')}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className="text-sm text-red-700 font-bold">₹{(parseFloat(payment.balance) || 0).toLocaleString('en-IN')}</span>
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className="text-xs text-slate-600">
                                      {payment.payment_date ? format(new Date(payment.payment_date), 'dd/MM/yy') : '—'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center">
                                    <Badge className={`${statusColors[payment.status]} rounded-full px-2.5 py-0.5 text-xs font-semibold`}>
                                      {payment.status}
                                    </Badge>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      <Progress value={itemProgress} className="h-2 flex-1 bg-slate-200" />
                                      <span className="text-xs font-semibold text-slate-600 w-12 text-right">{itemProgress.toFixed(0)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}