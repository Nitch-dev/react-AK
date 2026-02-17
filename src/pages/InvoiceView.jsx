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
import autoTable from 'jspdf-autotable'; // Add this import at the top
import { NotoSansRegular } from '../fonts/NotoSans';

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
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.addFileToVFS('NotoSans.ttf', NotoSansRegular);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;

    // --- 1. HEADER ---
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

    // --- 2. METADATA ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("TAX INVOICE", pageWidth / 2, 40, { align: 'center' });

    // Bill To
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, 45, 80, 7, 'F');
    doc.setFontSize(10);
    doc.text("Bill To:", margin + 2, 50);
    
    doc.setFont("helvetica", "normal");
    doc.text(invoice.client_name || "", margin, 58);
    doc.setFontSize(8);
    doc.text(`GSTIN: ${company?.gstin || ''}`, margin, 62);
    // doc.text(`Ph: ${company?.phone || ''})`, margin, 66);
    // doc.text(`Email: ${company?.email || ''})`, margin, 64);
    doc.text(invoice.client_address || "", margin, 66);
    doc.text(`State: ${invoice.client_state_name || ''} (${invoice.client_state_code || ''})`, margin, 70);

    // Right Side Details
    const rightX = pageWidth - margin;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Invoice No:", 135, 50);
    doc.text("Date:", 135, 55);
    doc.text("Ref No:", 135, 60);
    
    // doc.setFont("helvetica", "normal");
    doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');
    doc.setFont('NotoSans', 'normal');
    doc.text(invoice.invoice_number || "", rightX, 50, { align: 'right' });
    const dateStr = invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd/MM/yyyy') : '-';
    doc.text(dateStr, rightX, 55, { align: 'right' });
    doc.text(invoice.ref_number || "", rightX, 60, { align: 'right' });

    // --- 3. THE TABLE ---
    const tableRows = items.map((item, index) => [
      index + 1,
      item.barcode || '',
      item.description || '',
      item.hsn_code || '',
      item.quantity || '',
      item.unit || '',
      ` ₹ ${item.amount.toFixed(2)}` // Using Rs. ensures it stays inside the box safely
    ]);

    autoTable(doc, {
      startY: 72,
      head: [['S.No', 'Barcode', 'Description of Goods', 'HSN Code', 'Qty', 'Unit', 'Amount']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, font: 'NotoSans' },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', lineWidth: 0.1, font: 'NotoSans' },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 20 },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 30, halign: 'right' } // Increased width to fix "outside the box" issue
      },
      margin: { left: margin, right: margin }
    });

     // --- 4. FOOTER & DECLARATION ---
    let finalY = doc.lastAutoTable.finalY + 10;

    // Grand Total Row
    doc.setFont('NotoSans', 'normal');
    doc.text(`Total: ₹ ${invoice.grand_total.toFixed(2)}`, rightX, finalY, { align: 'right' });
    finalY += 10;
    if (finalY > 230) { doc.addPage(); finalY = 20; }

    // Amount in Words Box
    doc.setDrawColor(200);
    doc.setFillColor(250, 251, 252);
    doc.rect(margin, finalY, pageWidth - (margin * 2), 10, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(`Amount in Words: `, margin + 2, finalY + 6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${invoice.amount_in_words}`, margin + 32, finalY + 6.5);

    finalY += 18;

    // Declaration Text (From DB)
    if (invoice.declaration_text) {
      doc.setFontSize(7.5);
      doc.setTextColor(80);
      // This splits the database text into lines that fit the page width
      const declarationLines = doc.splitTextToSize(invoice.declaration_text, pageWidth - (margin * 2));
      doc.text(declarationLines, margin, finalY);
      finalY += (declarationLines.length * 4) + 10;
    }

    // Signatory Section
    if (finalY > 260) { doc.addPage(); finalY = 20; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`For ${company?.company_name || 'ALK RESELL SHOES'}`, rightX, finalY, { align: 'right' });
    
    doc.setLineWidth(0.2);
    doc.line(rightX - 50, finalY + 15, rightX, finalY + 15);
    doc.text("Authorized Signatory", rightX - 25, finalY + 20, { align: 'center' });

    doc.save(`Invoice_${invoice.invoice_number.replace(/\//g, '-')}.pdf`);
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Generation failed.');
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
                {company?.gstin && <p>GSTIN: {company?.gstin}</p>}
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
