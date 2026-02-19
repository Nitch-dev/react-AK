import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Eye, Trash2, Search, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
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
import InvoiceForm from "../components/invoices/InvoiceForm";
import BulkInvoiceUpload from "../components/invoices/BulkInvoiceUpload";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import EditInvoiceNumber from "../components/invoices/EditInvoiceNumber";
import { NotoSansRegular } from '../fonts/NotoSans';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [sortField, setSortField] = useState("invoice_date");
  const [sortDirection, setSortDirection] = useState("desc");

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    const data = await base44.entities.Invoice.list('-invoice_date');
    setInvoices(data);
    setLoading(false);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setShowBulkUpload(false);
    loadInvoices();
  };

  const handleDeleteClick = (invoice) => {
    if (invoice.status !== 'draft') {
      alert('Only draft invoices can be deleted');
      return;
    }
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    try {
      await base44.entities.Invoice.delete(invoiceToDelete.id);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      loadInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Failed to delete invoice');
    }
  };

  const handleStatusChange = async (invoiceId, newStatus) => {
    try {
      await base44.entities.Invoice.update(invoiceId, { status: newStatus });
      loadInvoices();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const downloadInvoicePDF = async (invoiceId) => {
  try {
    // 1. Fetch all required data
    const invoiceArr = await base44.entities.Invoice.filter({ id: invoiceId });
    if (!invoiceArr || invoiceArr.length === 0) return;
    const invoice = invoiceArr[0];

    const itemsData = await base44.entities.InvoiceItem.filter({ invoice_id: invoiceId });
    const items = itemsData.sort((a, b) => (a.row_index || 0) - (b.row_index || 0));

    const companies = await base44.entities.Company.list();
    const company = companies.length > 0 ? companies[0] : {};

    // 2. Bootstrap the PDF document (identical to InvoiceView's downloadPDF)
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.addFileToVFS('NotoSans.ttf', NotoSansRegular);
    doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;

    // ── HEADER ──────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(company?.company_name || "ALK RESELL SHOES", pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(company?.address || "", pageWidth / 2, 20, { align: 'center' });

    const headerInfo = `GSTIN: ${company?.gstin || ''}   Ph: ${company?.phone || ''}   Email: ${company?.email || ''}`;
    doc.text(headerInfo, pageWidth / 2, 25, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(margin, 30, pageWidth - margin, 30);

    // ── TITLE ────────────────────────────────────────────────────────────────
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("TAX INVOICE", pageWidth / 2, 40, { align: 'center' });

    // ── BILL TO ──────────────────────────────────────────────────────────────
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, 45, 80, 7, 'F');
    doc.setFontSize(10);
    doc.text("Bill To:", margin + 2, 50);

    doc.setFont("helvetica", "normal");
    doc.text(invoice.client_name || "", margin, 58);
    doc.setFontSize(8);
    doc.text(`GSTIN: ${invoice.client_gstin || ''}`, margin, 62);
    doc.text(invoice.client_address || "", margin, 66);
    doc.text(`State: ${invoice.client_state_name || ''} (${invoice.client_state_code || ''})`, margin, 70);

    // ── RIGHT-SIDE META ───────────────────────────────────────────────────────
    const rightX = pageWidth - margin;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Invoice No:", 135, 50);
    doc.text("Date:", 135, 55);
    doc.text("Ref No:", 135, 60);

    doc.setFont('NotoSans', 'normal');
    doc.text(invoice.invoice_number || "", rightX, 50, { align: 'right' });
    const dateStr = invoice.invoice_date
      ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy')
      : '-';
    doc.text(dateStr, rightX, 55, { align: 'right' });
    doc.text(invoice.ref_number || "", rightX, 60, { align: 'right' });

    // ── TABLE ────────────────────────────────────────────────────────────────
    const tableRows = items.map((item, index) => [
      index + 1,
      item.barcode || '',
      item.description || '',
      item.hsn_code || '',
      item.quantity || '',
      item.unit || '',
      `\u20B9 ${item.amount.toFixed(2)}`,  // \u20B9 = ₹
    ]);

    autoTable(doc, {
      startY: 72,
      head: [['S.No', 'Barcode', 'Description of Goods', 'HSN Code', 'Qty', 'Unit', 'Amount']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, font: 'NotoSans' },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'normal',
        lineWidth: 0.1,
        font: 'NotoSans',
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 20 },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 30, halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });

    // ── TOTAL ────────────────────────────────────────────────────────────────
    let finalY = doc.lastAutoTable.finalY + 10;

    doc.setFont('NotoSans', 'normal');
    doc.text(`Total: \u20B9 ${invoice.grand_total.toFixed(2)}`, rightX, finalY, { align: 'right' });
    finalY += 10;
    if (finalY > 230) { doc.addPage(); finalY = 20; }

    // ── AMOUNT IN WORDS ───────────────────────────────────────────────────────
    doc.setDrawColor(200);
    doc.setFillColor(250, 251, 252);
    doc.rect(margin, finalY, pageWidth - margin * 2, 10, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text('Amount in Words: ', margin + 2, finalY + 6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${invoice.amount_in_words}`, margin + 32, finalY + 6.5);
    finalY += 18;

    // ── DECLARATION ───────────────────────────────────────────────────────────
    if (invoice.declaration_text) {
      doc.setFontSize(7.5);
      doc.setTextColor(80);
      const declarationLines = doc.splitTextToSize(
        invoice.declaration_text,
        pageWidth - margin * 2
      );
      doc.text(declarationLines, margin, finalY);
      finalY += declarationLines.length * 4 + 10;
    }

    // ── SIGNATORY ─────────────────────────────────────────────────────────────
    if (finalY > 260) { doc.addPage(); finalY = 20; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`For ${company?.company_name || 'ALK RESELL SHOES'}`, rightX, finalY, { align: 'right' });

    doc.setLineWidth(0.2);
    doc.line(rightX - 50, finalY + 15, rightX, finalY + 15);
    doc.text("Authorized Signatory", rightX - 25, finalY + 20, { align: 'center' });

    // 3. Save
    doc.save(`Invoice_${invoice.invoice_number.replace(/\//g, '-')}.pdf`);

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF');
  }
};
  const statusColors = {
    draft: "bg-slate-100 text-slate-700 border border-slate-200",
    sent: "bg-blue-50 text-blue-700 border border-blue-200",
    paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    cancelled: "bg-red-50 text-red-700 border border-red-200"
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    
    let dateMatch = false;
    if (invoice.invoice_date && searchTerm) {
      try {
        const date = new Date(invoice.invoice_date);
        if (!isNaN(date.getTime())) {
          dateMatch = format(date, 'dd/MM/yyyy').includes(searchTerm);
        }
      } catch (e) {
        dateMatch = false;
      }
    }
    
    const matchesSearch = !searchTerm || 
      invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.grand_total?.toString().includes(searchTerm) ||
      dateMatch;
    return matchesStatus && matchesSearch;
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    let aVal, bVal;
    
    if (sortField === "invoice_date") {
      aVal = 0;
      bVal = 0;
      if (a.invoice_date) {
        try {
          const date = new Date(a.invoice_date);
          aVal = !isNaN(date.getTime()) ? date.getTime() : 0;
        } catch (e) {
          aVal = 0;
        }
      }
      if (b.invoice_date) {
        try {
          const date = new Date(b.invoice_date);
          bVal = !isNaN(date.getTime()) ? date.getTime() : 0;
        } catch (e) {
          bVal = 0;
        }
      }
    } else if (sortField === "grand_total") {
      aVal = a.grand_total || 0;
      bVal = b.grand_total || 0;
    } else if (sortField === "invoice_number") {
      // Extract numeric part from invoice number for proper sorting
      const extractNumber = (invoiceNum) => {
        if (!invoiceNum) return 0;
        const match = invoiceNum.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      };
      aVal = extractNumber(a.invoice_number);
      bVal = extractNumber(b.invoice_number);
    }
    
    if (sortDirection === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  if (showBulkUpload) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">Bulk Invoice Upload</h1>
            <Button variant="outline" onClick={() => setShowBulkUpload(false)}>
              Cancel
            </Button>
          </div>
          <BulkInvoiceUpload 
            onSuccess={handleSuccess} 
            onCancel={() => setShowBulkUpload(false)} 
          />
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">Create Invoice</h1>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
          <InvoiceForm onSuccess={handleSuccess} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Invoices</h1>
            <p className="text-slate-500 mt-1">Manage and track all your invoices</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowBulkUpload(true)} variant="outline" className="border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-md hover:shadow-lg">
              <Upload className="w-4 h-4 mr-2" /> Bulk Upload
            </Button>
            <Button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/30 hover:shadow-xl transition-all">
              <Plus className="w-4 h-4 mr-2" /> New Invoice
            </Button>
          </div>
        </div>

        <Card className="mb-6 shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by invoice number, client, date, or amount..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-500">Loading invoices...</p>
            </CardContent>
          </Card>
        ) : filteredInvoices.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {searchTerm || statusFilter !== 'all' ? 'No invoices found' : 'No invoices yet'}
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first invoice to get started'}
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Create Invoice
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                    <tr>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700">
                        <button 
                          onClick={() => handleSort("invoice_number")}
                          className="flex items-center gap-1 hover:text-blue-600"
                        >
                          Invoice No
                          {sortField === "invoice_number" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                          ) : (
                            <ArrowUpDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="text-left p-3 text-sm font-semibold">Client</th>
                      <th className="text-left p-3 text-sm font-semibold">
                        <button 
                          onClick={() => handleSort("invoice_date")}
                          className="flex items-center gap-1 hover:text-blue-600"
                        >
                          Date
                          {sortField === "invoice_date" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                          ) : (
                            <ArrowUpDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="text-right p-3 text-sm font-semibold">
                        <button 
                          onClick={() => handleSort("grand_total")}
                          className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                        >
                          Amount
                          {sortField === "grand_total" ? (
                            sortDirection === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                          ) : (
                            <ArrowUpDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="text-left p-3 text-sm font-semibold">Status</th>
                      <th className="text-center p-3 text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInvoices.map((invoice, index) => (
                      <tr key={invoice.id} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{invoice.invoice_number}</span>
                            <EditInvoiceNumber invoice={invoice} onUpdate={loadInvoices} />
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{invoice.client_name}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">
                            {(() => {
                              if (!invoice.invoice_date) return '-';
                              try {
                                const date = new Date(invoice.invoice_date);
                                return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : '-';
                              } catch (e) {
                                return '-';
                              }
                            })()}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-semibold text-sm">₹{invoice.grand_total?.toFixed(2)}</span>
                        </td>
                        <td className="p-4">
                          <Select 
                            value={invoice.status} 
                            onValueChange={(value) => handleStatusChange(invoice.id, value)}
                          >
                            <SelectTrigger className="h-8 w-28 text-xs rounded-full border-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-center">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-9 w-9 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all"
                              onClick={() => downloadInvoicePDF(invoice.id)}
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Link to={createPageUrl('InvoiceView') + '?id=' + invoice.id}>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all" title="View Invoice">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            {invoice.status === 'draft' && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-9 w-9 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 transition-all"
                                onClick={() => handleDeleteClick(invoice)}
                                title="Delete Invoice"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete invoice {invoiceToDelete?.invoice_number}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}