import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { format } from "date-fns";
import * as XLSX from 'xlsx';
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function InvoiceView() {
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, []);

  const loadInvoice = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const invoiceId = urlParams.get('id');
    
    if (!invoiceId) {
      setLoading(false);
      return;
    }

    const [invoiceData, itemsData, companyData] = await Promise.all([
      base44.entities.Invoice.filter({ id: invoiceId }),
      base44.entities.InvoiceItem.filter({ invoice_id: invoiceId }),
      base44.entities.Company.list()
    ]);

    if (invoiceData.length > 0) {
      setInvoice(invoiceData[0]);
      const sortedItems = itemsData.sort((a, b) => (a.row_index || 0) - (b.row_index || 0));
      setItems(sortedItems);
      setCompany(companyData.length > 0 ? companyData[0] : null);
    }
    setLoading(false);
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const element = document.getElementById('invoice-content');
      
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`Invoice_${invoice.invoice_number.replace(/\//g, '-')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const downloadExcel = () => {
    const data = items.map((item, index) => ({
      "S.No": index + 1,
      "Barcode": item.barcode || '',
      "Description of Goods": item.description,
      "HSN Code": item.hsn_code,
      "Quantity": item.quantity,
      "Unit": item.unit,
      "Amount": item.amount
    }));

    data.push({
      "S.No": "",
      "Barcode": "",
      "Description of Goods": "",
      "HSN Code": "Total",
      "Quantity": invoice.total_quantity,
      "Unit": "",
      "Amount": invoice.grand_total
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoice");
    
    const fileName = `Invoice-${invoice.invoice_number.replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <p className="text-gray-500">Loading invoice...</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            <p className="text-gray-500">Invoice not found</p>
            <Link to={createPageUrl('Invoices')}>
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Invoices
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to={createPageUrl('Invoices')}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button onClick={downloadExcel} variant="outline">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
            <Button onClick={downloadPDF} disabled={downloading} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-2" />
              {downloading ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          </div>
        </div>

        <Card id="invoice-content" className="p-8 bg-white">
          {/* Company Header */}
          {company && (
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
              <h1 className="text-3xl font-bold text-gray-800">{company.company_name}</h1>
              <p className="text-sm text-gray-600 mt-2">{company.address}</p>
              <div className="flex justify-center gap-6 text-sm text-gray-600 mt-2">
                {company.gstin && <span>GSTIN: {company.gstin}</span>}
                {company.phone && <span>Ph: {company.phone}</span>}
                {company.email && <span>Email: {company.email}</span>}
              </div>
            </div>
          )}

          {/* Invoice Title */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">TAX INVOICE</h2>
          </div>

          {/* Invoice Details Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="font-bold text-sm mb-2 bg-gray-100 p-2">Bill To:</h3>
              <div className="text-sm space-y-1">
                <p className="font-semibold">{invoice.client_name}</p>
                <p>{invoice.client_address}</p>
                {invoice.client_gstin && <p>GSTIN: {invoice.client_gstin}</p>}
                {invoice.client_state_name && (
                  <p>State: {invoice.client_state_name} ({invoice.client_state_code})</p>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Invoice No:</span>
                  <span>{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Date:</span>
                  <span>{(() => {
                    if (!invoice.invoice_date) return '-';
                    try {
                      const date = new Date(invoice.invoice_date);
                      return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : '-';
                    } catch (e) {
                      return '-';
                    }
                  })()}</span>
                </div>
                {invoice.ref_number && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Ref No:</span>
                    <span>{invoice.ref_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-y-2 border-gray-800">
                  <th className="text-left p-2 border-r border-gray-300">S.No</th>
                  <th className="text-left p-2 border-r border-gray-300">Barcode</th>
                  <th className="text-left p-2 border-r border-gray-300">Description of Goods</th>
                  <th className="text-left p-2 border-r border-gray-300">HSN Code</th>
                  <th className="text-center p-2 border-r border-gray-300">Qty</th>
                  <th className="text-center p-2 border-r border-gray-300">Unit</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-300">
                    <td className="p-2 border-r border-gray-300">{index + 1}</td>
                    <td className="p-2 border-r border-gray-300 font-mono text-xs">{item.barcode || '-'}</td>
                    <td className="p-2 border-r border-gray-300">{item.description}</td>
                    <td className="p-2 border-r border-gray-300">{item.hsn_code}</td>
                    <td className="text-center p-2 border-r border-gray-300">{item.quantity}</td>
                    <td className="text-center p-2 border-r border-gray-300">{item.unit}</td>
                    <td className="text-right p-2">₹{item.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-y-2 border-gray-800 font-bold">
                  <td colSpan="4" className="p-2 text-right border-r border-gray-300">Total</td>
                  <td className="text-center p-2 border-r border-gray-300">{invoice.total_quantity}</td>
                  <td className="p-2 border-r border-gray-300"></td>
                  <td className="text-right p-2">₹{invoice.grand_total?.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Amount in Words */}
          <div className="mb-6 p-3 bg-gray-50 border border-gray-300">
            <p className="text-sm">
              <span className="font-semibold">Amount in Words: </span>
              {invoice.amount_in_words}
            </p>
          </div>

          {/* Declaration */}
          {invoice.declaration_text && (
            <div className="mb-6">
              <p className="text-xs text-gray-700 whitespace-pre-line">{invoice.declaration_text}</p>
            </div>
          )}

          {/* Footer Signature */}
          {company && (
            <div className="flex justify-end mt-16">
              <div className="text-center">
                <p className="text-sm font-semibold">For {company.company_name}</p>
                <div className="mt-20 mb-2 border-t-2 border-gray-800 w-48"></div>
                <p className="text-sm">Authorized Signatory</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}