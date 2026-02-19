import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle, FileText, History, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatIndianCurrency } from "@/components/utils/formatCurrency";
import * as XLSX from 'xlsx';

export default function HistoricalImportPage() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationErrors([]);
      setPreviewData(null);
      setImportResult(null);
    }
  };
  const downloadGSTTemplate = () => {
    const data = [
      ["Invoice Number", "Invoice Date", "Customer Name", "Barcode", "Description", "Colour", "Size", "GST Purchase Price", "GST Margin", "Sales Amount"],
      ["ALK/24-25/08", "03/09/2024", "House of MK", 524060368, "AJ1 HIGH", "UNC TOE 2023", "UK 7.5", 16500, 500, 17000],
      ["ALK/24-25/08", "03/09/2024", "House of MK", 524061489, "AJ1 LOW", "BRED TOE 2.0", "UK 7", 8300, 500, 8800],
    
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GST");

    XLSX.writeFile(wb, "Sample_Historical_Data.xlsx");
  };


  const processFile = async () => {
      if (!file) return;
      
      setProcessing(true);
      setValidationErrors([]);
      setPreviewData(null);
      setProgress(0);
      
      try {
        // 1. Prepare the file
        const formData = new FormData();
        formData.append('file', file);
        
        setProgress(20);

        // 2. Hit your unified Flask endpoint on Vercel
        const response = await fetch("https://flask-backend-ak.vercel.app/api/integrations/upload", {
          method: 'POST',
          body: formData,
        });

        setProgress(60);

        const result = await response.json();

        if (result.status === "success" && result.output) {
          // 3. Convert output to array if it isn't one
          const rows = Array.isArray(result.output) ? result.output : [result.output];
          
          // 4. Pass the extracted rows to your existing validation logic
          await validateData(rows);
          
          setProgress(100);
        } else {
          throw new Error(result.message || 'Failed to parse Excel file');
        }
      } catch (error) {
        console.error('Error processing file:', error);
        setValidationErrors([{ 
          row: 0, 
          message: 'Error processing file: ' + error.message 
        }]);
      } finally {
        setProcessing(false);
      }
    };
  const parseDate = (rawDate) => {
    if (!rawDate) return null;
    
    if (typeof rawDate === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const dateObj = new Date(excelEpoch.getTime() + rawDate * 86400000);
      const dd = String(dateObj.getUTCDate()).padStart(2, '0');
      const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dateObj.getUTCFullYear();
      return `${yyyy}-${mm}-${dd}`;
    }
    
    if (typeof rawDate === 'string') {
      const dateStr = rawDate.trim();
      
      const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
      const isoMatch = dateStr.match(isoPattern);
      
      if (isoMatch) {
        const year = isoMatch[1];
        const month = String(isoMatch[2]).padStart(2, '0');
        const day = String(isoMatch[3]).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
      const match = dateStr.match(ddmmyyyyPattern);
      
      if (match) {
        const day = String(match[1]).padStart(2, '0');
        const month = String(match[2]).padStart(2, '0');
        const year = match[3];
        
        const dayNum = parseInt(match[1], 10);
        const monthNum = parseInt(match[2], 10);
        const yearNum = parseInt(match[3], 10);
        
        if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
          return `${year}-${month}-${day}`;
        }
      }
    }
    
    return null;
  };

  const validateData = async (rows) => {
    const errors = [];
    const validRecords = [];
    const invoiceNumbers = new Set();
    const barcodes = new Set();

    // Fetch existing data
    const existingSales = await base44.entities.Sales.list();
    const existingBarcodes = new Set(existingSales.map(s => s.barcode));
    const existingInvoices = await base44.entities.Invoice.list();
    const existingInvoiceNumbers = new Set(existingInvoices.map(i => i.invoice_number));

    setProgress(60);

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      
      const invoiceNumber = row['Invoice Number']?.toString().trim();
      if (!invoiceNumber) {
        errors.push({ row: rowNum, message: 'Missing Invoice Number' });
        return;
      }

      if (existingInvoiceNumbers.has(invoiceNumber)) {
        errors.push({ row: rowNum, message: `Invoice Number already exists: ${invoiceNumber}` });
        return;
      }

      // Allow same invoice number for multiple items (invoice line items)
      invoiceNumbers.add(invoiceNumber);

      const invoiceDate = parseDate(row['Invoice Date']);
      if (!invoiceDate) {
        errors.push({ row: rowNum, message: 'Invalid or missing Invoice Date' });
        return;
      }

      const customerName = row['Customer Name']?.toString().trim();
      if (!customerName) {
        errors.push({ row: rowNum, message: 'Missing Customer Name' });
        return;
      }

      const barcode = row['Barcode']?.toString().trim();
      if (!barcode) {
        errors.push({ row: rowNum, message: 'Missing Barcode' });
        return;
      }

      if (existingBarcodes.has(barcode)) {
        errors.push({ row: rowNum, message: `Duplicate Barcode: ${barcode} (already exists)` });
        return;
      }

      if (barcodes.has(barcode)) {
        errors.push({ row: rowNum, message: `Duplicate Barcode in file: ${barcode}` });
      }
      barcodes.add(barcode);

      const description = row['Description']?.toString().trim();
      if (!description) {
        errors.push({ row: rowNum, message: 'Missing Description' });
        return;
      }

      const colour = row['Colour']?.toString().trim();
      if (!colour) {
        errors.push({ row: rowNum, message: 'Missing Colour' });
        return;
      }

      const size = row['Size']?.toString().trim();
      if (!size) {
        errors.push({ row: rowNum, message: 'Missing Size' });
        return;
      }

      const salesAmount = parseFloat(row['Sales Amount']);
      if (!salesAmount || salesAmount <= 0) {
        errors.push({ row: rowNum, message: 'Invalid Sales Amount' });
        return;
      }

      const gstMargin = parseFloat(row['GST Margin']);
      if (gstMargin === undefined || gstMargin === null || isNaN(gstMargin)) {
        errors.push({ row: rowNum, message: 'Invalid GST Margin' });
        return;
      }

      const gstPurchasePrice = parseFloat(row['GST Purchase Price']) || (salesAmount - gstMargin);

      validRecords.push({
        invoiceNumber,
        invoiceDate,
        customerName,
        barcode,
        description,
        colour,
        size,
        salesAmount,
        gstMargin,
        gstPurchasePrice
      });
    });

    setProgress(80);

    if (errors.length > 0) {
      setValidationErrors(errors);
      setProgress(0);
    } else {
      // Group by invoice
      const invoiceGroups = {};
      validRecords.forEach(record => {
        if (!invoiceGroups[record.invoiceNumber]) {
          invoiceGroups[record.invoiceNumber] = {
            invoiceNumber: record.invoiceNumber,
            invoiceDate: record.invoiceDate,
            customerName: record.customerName,
            items: []
          };
        }
        invoiceGroups[record.invoiceNumber].items.push(record);
      });

      const invoices = Object.values(invoiceGroups);
      const totalSales = validRecords.reduce((sum, r) => sum + r.salesAmount, 0);
      const totalGST = validRecords.reduce((sum, r) => sum + (r.gstMargin * 0.18), 0);
      const dates = validRecords.map(r => new Date(r.invoiceDate));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));

      setPreviewData({
        records: validRecords,
        invoices,
        totalRows: validRecords.length,
        totalInvoices: invoices.length,
        totalSales,
        totalGST,
        dateRange: {
          from: minDate.toLocaleDateString('en-IN'),
          to: maxDate.toLocaleDateString('en-IN')
        }
      });
      setProgress(100);
    }
  };

  const confirmImport = async () => {
    if (!previewData) return;

    setImporting(true);
    setProgress(0);

    try {
      const { records, invoices } = previewData;
      
      // Fetch or create clients and company
      let clients = await base44.entities.Client.list();
      const companies = await base44.entities.Company.list();
      const company = companies.length > 0 ? companies[0] : null;

      setProgress(10);

      const importBatchId = `HIST_${Date.now()}`;
      let processedCount = 0;
      const totalSteps = invoices.length;

      // Process each invoice
      for (const invoiceGroup of invoices) {
        // Find or create client
        let client = clients.find(c => c.party_name.toLowerCase() === invoiceGroup.customerName.toLowerCase());
        
        if (!client) {
          client = await base44.entities.Client.create({
            party_name: invoiceGroup.customerName,
            address: '',
            gstin: '',
            state_name: company?.state_name || '',
            state_code: company?.state_code || ''
          });
          clients.push(client);
        }

        // Determine financial year
        const getFinancialYear = (dateStr) => {
          const d = new Date(dateStr);
          const month = d.getMonth();
          const year = d.getFullYear();
          if (month >= 3) {
            return `${year.toString().slice(2)}-${(year + 1).toString().slice(2)}`;
          }
          return `${(year - 1).toString().slice(2)}-${year.toString().slice(2)}`;
        };

        const numberToWords = (num) => {
          const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
          const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
          const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
          
          if (num === 0) return 'Zero';
          if (num < 10) return ones[num];
          if (num < 20) return teens[num - 10];
          if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
          if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
          if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
          if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
          return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
        };

        const financialYear = getFinancialYear(invoiceGroup.invoiceDate);
        const totalQuantity = invoiceGroup.items.length;
        const grandTotal = invoiceGroup.items.reduce((sum, item) => sum + item.salesAmount, 0);

        // Create Invoice
        const invoice = await base44.entities.Invoice.create({
          invoice_number: invoiceGroup.invoiceNumber,
          ref_number: invoiceGroup.invoiceNumber,
          invoice_date: invoiceGroup.invoiceDate,
          financial_year: financialYear,
          client_id: client.id,
          client_name: client.party_name,
          client_address: client.address,
          client_gstin: client.gstin,
          client_state_name: client.state_name,
          client_state_code: client.state_code,
          total_quantity: totalQuantity,
          grand_total: grandTotal,
          amount_in_words: numberToWords(Math.floor(grandTotal)) + ' Rupees Only',
          declaration_text: "1) The goods described in this invoice are pre-owned / second-hand goods supplied under the GST Margin Scheme in accordance with applicable provisions of the GST law.\n\n2) The invoice value represents the final and agreed transaction value between the parties under the Margin Scheme. Payment against this invoice shall be made in full as per the agreed terms and timelines.\n\n3) All particulars stated herein are true and correct to the best of our knowledge and belief at the time of issuance.",
          status: "sent"
        });

        // Create Sales, Invoice Items, Payment Tracker, and GST entries
        const salesData = [];
        const invoiceItems = [];
        const paymentTrackerData = [];
        const gstData = [];

        invoiceGroup.items.forEach((item, idx) => {
          salesData.push({
            import_batch_id: importBatchId,
            barcode: item.barcode,
            description: item.description,
            colour: item.colour,
            size: item.size,
            price: item.salesAmount,
            sale_date: invoiceGroup.invoiceDate
          });

          invoiceItems.push({
            invoice_id: invoice.id,
            row_index: idx,
            barcode: item.barcode,
            description: `${item.description} - ${item.colour} - ${item.size}`,
            hsn_code: "640319",
            quantity: 1,
            unit: "Pair",
            rate: item.salesAmount,
            amount: item.salesAmount
          });

          paymentTrackerData.push({
            barcode: item.barcode,
            sale_amount: item.salesAmount,
            received_amount: 0,
            balance: item.salesAmount,
            status: "unpaid",
            sale_date: invoiceGroup.invoiceDate
          });

          const saleDate = new Date(invoiceGroup.invoiceDate);
          gstData.push({
            barcode: item.barcode,
            description: item.description,
            colour: item.colour,
            size: item.size,
            sale_amount: item.salesAmount,
            margin_taxable: item.gstMargin,
            purchase_amount: item.gstPurchasePrice,
            gst_amount: item.gstMargin * 0.18,
            month: saleDate.getMonth() + 1,
            year: saleDate.getFullYear(),
            sale_date: invoiceGroup.invoiceDate
          });
        });

        await base44.entities.Sales.bulkCreate(salesData);
        await base44.entities.InvoiceItem.bulkCreate(invoiceItems);
        await base44.entities.PaymentTracker.bulkCreate(paymentTrackerData);
        await base44.entities.GST.bulkCreate(gstData);

        processedCount++;
        setProgress(10 + Math.floor((processedCount / totalSteps) * 90));
      }

      setProgress(100);
      setImportResult({
        success: true,
        totalRows: records.length,
        totalInvoices: invoices.length,
        totalSales: previewData.totalSales,
        totalGST: previewData.totalGST
      });
    } catch (error) {
      console.error('Error importing data:', error);
      alert('Error importing data: ' + error.message);
      setProgress(0);
    } finally {
      setImporting(false);
    }
  };

  if (importResult?.success) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto">
          <Card className="bg-white/80 backdrop-blur shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-6 h-6" />
                Historical Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <p className="text-sm text-blue-600 font-semibold">Total Rows</p>
                  <p className="text-2xl font-bold text-blue-800">{importResult.totalRows}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                  <p className="text-sm text-purple-600 font-semibold">Invoices Created</p>
                  <p className="text-2xl font-bold text-purple-800">{importResult.totalInvoices}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                  <p className="text-sm text-green-600 font-semibold">Total Sales</p>
                  <p className="text-2xl font-bold text-green-800">{formatIndianCurrency(importResult.totalSales)}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
                  <p className="text-sm text-orange-600 font-semibold">Total GST</p>
                  <p className="text-2xl font-bold text-orange-800">{formatIndianCurrency(importResult.totalGST)}</p>
                </div>
              </div>

              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  All invoices have been created as <strong>Confirmed</strong>. GST records, sales entries, and payment ledgers have been automatically updated.
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button onClick={() => {
                  setFile(null);
                  setImportResult(null);
                  setPreviewData(null);
                  setProgress(0);
                }} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (previewData) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto">
          <Card className="bg-white/80 backdrop-blur shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                Import Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <p className="text-sm text-blue-600 font-semibold">Total Rows</p>
                  <p className="text-2xl font-bold text-blue-800">{previewData.totalRows}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                  <p className="text-sm text-purple-600 font-semibold">Invoices</p>
                  <p className="text-2xl font-bold text-purple-800">{previewData.totalInvoices}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                  <p className="text-sm text-green-600 font-semibold">Total Sales</p>
                  <p className="text-2xl font-bold text-green-800">{formatIndianCurrency(previewData.totalSales)}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
                  <p className="text-sm text-orange-600 font-semibold">Total GST</p>
                  <p className="text-2xl font-bold text-orange-800">{formatIndianCurrency(previewData.totalGST)}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-sm text-slate-600 font-semibold mb-1">Date Range</p>
                <p className="text-lg font-bold text-slate-800">{previewData.dateRange.from} to {previewData.dateRange.to}</p>
              </div>

              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Review the summary above. Upon confirmation, all invoices will be created as <strong>Confirmed</strong>, and GST, sales, and ledger entries will be automatically generated.
                </AlertDescription>
              </Alert>

              {importing && (
                <div className="space-y-3">
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-center text-gray-600">
                    Importing... {progress}%
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setPreviewData(null);
                    setProgress(0);
                  }}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmImport}
                  disabled={importing}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  {importing ? 'Importing...' : 'Confirm & Import'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Historical Data Import</h1>
            <p className="text-slate-500 mt-1">Bulk backfill historical sales from 2024 onwards</p>
          </div>
        </div>

        <Card className="bg-white/80 backdrop-blur shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-6 h-6 text-blue-600" />
              Upload Historical Sales Data
            </CardTitle>
            <div className="flex gap-3 justify-end">
              <Button 
                onClick={downloadGSTTemplate} 
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                Download Sample Data
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Required columns:</strong> Invoice Number, Invoice Date, Customer Name, Barcode, Description, Colour, Size, Sales Amount, GST Purchase Price, GST Margin
                <br />
                <span className="text-sm text-gray-600 mt-1 block">All invoice numbers and barcodes must be unique. Date format: DD/MM/YYYY</span>
              </AlertDescription>
            </Alert>

            <div className="border-2 border-dashed rounded-lg p-8 text-center bg-gradient-to-br from-slate-50 to-blue-50">
              <Upload className="w-12 h-12 mx-auto text-blue-500 mb-4" />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="historical-upload"
              />
              <label htmlFor="historical-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>Select Excel File</span>
                </Button>
              </label>
              {file && (
                <p className="text-sm text-gray-600 mt-3">
                  Selected: <strong>{file.name}</strong>
                </p>
              )}
            </div>

            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-2">Validation Errors ({validationErrors.length}):</p>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {validationErrors.map((error, idx) => (
                      <p key={idx} className="text-xs">
                        Row {error.row}: {error.message}
                      </p>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {processing && (
              <div className="space-y-3">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-gray-600">
                  Processing... {progress}%
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button 
                onClick={processFile} 
                disabled={!file || processing}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                {processing ? 'Processing...' : 'Validate & Preview'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
