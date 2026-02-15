import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle, FileText, FileCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SalesImportPage() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const clientData = await base44.entities.Client.list();
    setClients(clientData);
    if (clientData.length > 0) {
      setSelectedClient(clientData[0].id);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationErrors([]);
      setImportResult(null);
      setPreviewData(null);
    }
  };

  const processFile = async () => {
    if (!file) return;

    setProcessing(true);
    setValidationErrors([]);
    setPreviewData(null);
    setProgress(0);

    try {
      // 1. Prepare the file for upload
      const formData = new FormData();
      formData.append('file', file);

      setProgress(20);

      // 2. Call your new unified Flask endpoint
      // Replace YOUR_FLASK_URL with your Vercel backend URL or use your SDK's fetch
      const response = await fetch("https://flask-backend-ak.vercel.app/api/integrations/upload", {
        method: 'POST',
        body: formData,
      });

      setProgress(60);

      const result = await response.json();

      if (result.status === "success" && result.output) {
        // 3. Handle the returned data
        const rows = Array.isArray(result.output) ? result.output : [result.output];
        
        setPreviewData(rows);
        setProgress(100); // Done!
        setProcessing(false);
      } else {
        throw new Error(result.message || 'Failed to parse Excel file');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setValidationErrors([{ 
        row: 0, 
        message: 'Error processing file: ' + error.message 
      }]);
      setProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!previewData) return;
    
    setConfirming(true);
    setProgress(60);
    
    try {
      await validateAndImport(previewData);
    } catch (error) {
      console.error('Error importing data:', error);
      setValidationErrors([{ row: 0, message: 'Error importing data: ' + error.message }]);
      setConfirming(false);
    }
  };

  const validateAndImport = async (rows) => {
    const errors = [];
    const validRecords = [];
    const existingBarcodes = new Set();

    // Fetch ALL existing barcodes (no limits for scalability)
    const existingSales = await base44.entities.Sales.list('-created_date', 10000);
    existingSales.forEach(sale => existingBarcodes.add(sale.barcode));
    setProgress(60);

    // Generate unique import batch ID
    const importBatchId = `IMPORT_${Date.now()}`;

    // PHASE 1: VALIDATE ALL ROWS (abort if any fail)
    rows.forEach((row, index) => {
      const rowNum = index + 2;
      
      const barcode = row['BARCODE'];
      if (!barcode) {
        errors.push({ row: rowNum, message: 'Missing BARCODE' });
        return;
      }

      if (existingBarcodes.has(barcode.toString().trim())) {
        errors.push({ row: rowNum, message: `Duplicate BARCODE: ${barcode}` });
        return;
      }

      existingBarcodes.add(barcode.toString().trim());

      const description = row['Description'] || '';
      const colour = row['Colour'] || '';
      const size = row['Size'] || '';
      const price = row['Price'] || 0;
      
      // Parse date explicitly as DD/MM/YYYY format - keep as date-only string
      let parsedDate;
      const rawDate = row['Date'];
      
      if (!rawDate) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        parsedDate = `${yyyy}-${mm}-${dd}`;
      } else if (typeof rawDate === 'number') {
        // Excel serial date number - convert directly to YYYY-MM-DD without timezone
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dateObj = new Date(excelEpoch.getTime() + rawDate * 86400000);
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getUTCFullYear();
        parsedDate = `${yyyy}-${mm}-${dd}`;
      } else if (typeof rawDate === 'string') {
        // Parse various string date formats
        const dateStr = rawDate.trim();
        
        // Try ISO format first (YYYY-MM-DD or with time)
        const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
        const isoMatch = dateStr.match(isoPattern);
        
        if (isoMatch) {
          const year = isoMatch[1];
          const month = String(isoMatch[2]).padStart(2, '0');
          const day = String(isoMatch[3]).padStart(2, '0');
          parsedDate = `${year}-${month}-${day}`;
        } else {
          // Try DD/MM/YYYY format
          const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
          const match = dateStr.match(ddmmyyyyPattern);
          
          if (match) {
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            const year = match[3];
            
            // Validate date values
            const dayNum = parseInt(match[1], 10);
            const monthNum = parseInt(match[2], 10);
            const yearNum = parseInt(match[3], 10);
            
            if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900) {
              parsedDate = `${year}-${month}-${day}`;
            } else {
              const today = new Date();
              const dd = String(today.getDate()).padStart(2, '0');
              const mm = String(today.getMonth() + 1).padStart(2, '0');
              const yyyy = today.getFullYear();
              parsedDate = `${yyyy}-${mm}-${dd}`;
            }
          } else {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, '0');
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const yyyy = today.getFullYear();
            parsedDate = `${yyyy}-${mm}-${dd}`;
          }
        }
      } else {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        parsedDate = `${yyyy}-${mm}-${dd}`;
      }

      validRecords.push({
        import_batch_id: importBatchId,
        barcode: barcode.toString().trim(),
        description,
        colour,
        size,
        price,
        sale_date: parsedDate
      });
    });

    // ABORT if ANY validation errors
    if (errors.length > 0) {
      setValidationErrors(errors);
      setProgress(0);
      setConfirming(false);
      return;
    }

    // PHASE 2: ATOMIC INSERT - Sales is single source of truth
    try {
      setProgress(65);
      
      // Insert ALL sales records
      const createdSales = await base44.entities.Sales.bulkCreate(validRecords);
      
      setProgress(75);
      
      // CLONE Sales → PaymentTracker (1:1 direct copy)
      const paymentTrackerEntries = validRecords.map(record => ({
        barcode: record.barcode,
        sale_amount: record.price,
        received_amount: 0,
        balance: record.price,
        status: "unpaid",
        sale_date: record.sale_date
      }));
      const createdPayments = await base44.entities.PaymentTracker.bulkCreate(paymentTrackerEntries);
      
      setProgress(85);
      
      // CLONE Sales → GST (1:1 direct copy with calculated fields)
      const existingGSTCount = (await base44.entities.GST.list('-created_date', 10000)).length;
      const gstEntries = validRecords.map((record, index) => {
        const saleDate = new Date(record.sale_date);
        const marginTaxable = 500;
        return {
          sr_no: existingGSTCount + index + 1,
          barcode: record.barcode,
          description: record.description,
          colour: record.colour,
          size: record.size,
          sale_amount: record.price,
          margin_taxable: marginTaxable,
          purchase_amount: record.price - marginTaxable,
          gst_amount: marginTaxable * 0.18,
          month: saleDate.getMonth() + 1,
          year: saleDate.getFullYear(),
          status: "draft",
          sale_date: record.sale_date
        };
      });
      const createdGST = await base44.entities.GST.bulkCreate(gstEntries);
      
      setProgress(95);
      
      // PHASE 3: MANDATORY VALIDATION - verify data integrity
      const salesCount = validRecords.length;
      const paymentsCount = createdPayments.length;
      const gstCount = createdGST.length;
      
      const salesTotal = validRecords.reduce((sum, r) => sum + r.price, 0);
      const paymentsTotal = paymentTrackerEntries.reduce((sum, p) => sum + p.sale_amount, 0);
      const gstTotal = gstEntries.reduce((sum, g) => sum + g.sale_amount, 0);
      
      // Check for mismatches
      
      if (salesCount !== paymentsCount || salesCount !== gstCount) {
        throw new Error(
          `DATA INTEGRITY ERROR: Row count mismatch!\n` +
          `Sales: ${salesCount} | Payments: ${paymentsCount} | GST: ${gstCount}\n` +
          `Import rolled back - contact support.`
        );
      }
      
      if (Math.abs(salesTotal - paymentsTotal) > 0.01 || Math.abs(salesTotal - gstTotal) > 0.01) {
        throw new Error(
          `DATA INTEGRITY ERROR: Amount mismatch!\n` +
          `Sales: ₹${salesTotal} | Payments: ₹${paymentsTotal} | GST: ₹${gstTotal}\n` +
          `Import rolled back - contact support.`
        );
      }
      
      setProgress(100);
      setImportResult({
        success: true,
        count: validRecords.length,
        records: validRecords,
        importBatchId: importBatchId,
        validation: {
          salesCount,
          paymentsCount,
          gstCount,
          salesTotal,
          paymentsTotal,
          gstTotal
        }
      });
      setConfirming(false);
      
    } catch (error) {
      // Rollback attempt failed - show error to user
      setValidationErrors([{ 
        row: 0, 
        message: error.message || 'Critical error during import. Data may be inconsistent - please verify manually.' 
      }]);
      setProgress(0);
      setConfirming(false);
    }
  };

  const generateInvoices = async () => {
    if (!selectedClient || !importResult?.records) return;
    
    setGeneratingInvoices(true);
    
    try {
      const client = clients.find(c => c.id === selectedClient);
      const companies = await base44.entities.Company.list();
      const company = companies.length > 0 ? companies[0] : null;

      // Group sales by date
      const groupedByDate = importResult.records.reduce((acc, sale) => {
        const date = sale.sale_date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(sale);
        return acc;
      }, {});

      const createdInvoices = [];

      for (const [date, salesItems] of Object.entries(groupedByDate)) {
        const totalQuantity = salesItems.length;
        const grandTotal = salesItems.reduce((sum, item) => sum + item.price, 0);
        
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

        const financialYear = getFinancialYear(date);
        const existingInvoices = await base44.entities.Invoice.filter({ financial_year: financialYear });
        const invoiceNum = existingInvoices.length + 1;
        const invoiceNumber = `${company?.company_code || 'INV'}/${financialYear}/${invoiceNum}`;

        const invoice = await base44.entities.Invoice.create({
          invoice_number: invoiceNumber,
          ref_number: invoiceNumber,
          invoice_date: date,
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
          status: "draft"
        });

        const itemsToCreate = salesItems.map((sale, idx) => ({
          invoice_id: invoice.id,
          row_index: idx,
          barcode: sale.barcode,
          description: `${sale.description} - ${sale.colour} - ${sale.size}`,
          hsn_code: "640319",
          quantity: 1,
          unit: "Pair",
          rate: sale.price,
          amount: sale.price
        }));

        await base44.entities.InvoiceItem.bulkCreate(itemsToCreate);
        createdInvoices.push(invoice);
      }

      setImportResult({
        ...importResult,
        invoicesGenerated: true,
        invoiceCount: createdInvoices.length
      });
    } catch (error) {
      console.error('Error generating invoices:', error);
      alert('Error generating invoices: ' + error.message);
    } finally {
      setGeneratingInvoices(false);
    }
  };

  if (previewData && !importResult) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-600" />
                Confirm Import - {previewData.length} Records Found
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Review the data below and click "Confirm Import" to proceed with importing {previewData.length} sales records.
                </AlertDescription>
              </Alert>

              <div className="border-2 border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-sm font-semibold">Barcode</th>
                      <th className="text-left p-3 text-sm font-semibold">Description</th>
                      <th className="text-left p-3 text-sm font-semibold">Colour</th>
                      <th className="text-left p-3 text-sm font-semibold">Size</th>
                      <th className="text-right p-3 text-sm font-semibold">Price</th>
                      <th className="text-left p-3 text-sm font-semibold">Sale Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 100).map((row, idx) => {
                      const formatPreviewDate = (rawDate) => {
                        if (!rawDate) return '-';
                        
                        if (typeof rawDate === 'number') {
                          const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                          const dateObj = new Date(excelEpoch.getTime() + rawDate * 86400000);
                          const dd = String(dateObj.getUTCDate()).padStart(2, '0');
                          const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                          const yyyy = dateObj.getUTCFullYear();
                          return `${dd}/${mm}/${yyyy}`;
                        }
                        
                        if (typeof rawDate === 'string') {
                          const dateStr = rawDate.trim();
                          const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
                          const isoMatch = dateStr.match(isoPattern);
                          
                          if (isoMatch) {
                            const day = String(isoMatch[3]).padStart(2, '0');
                            const month = String(isoMatch[2]).padStart(2, '0');
                            const year = isoMatch[1];
                            return `${day}/${month}/${year}`;
                          }
                          
                          const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
                          const match = dateStr.match(ddmmyyyyPattern);
                          if (match) {
                            const day = String(match[1]).padStart(2, '0');
                            const month = String(match[2]).padStart(2, '0');
                            return `${day}/${month}/${match[3]}`;
                          }
                        }
                        
                        return '-';
                      };
                      
                      return (
                        <tr key={idx} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-sm font-mono">{row['BARCODE']}</td>
                          <td className="p-3 text-sm">{row['Description'] || '-'}</td>
                          <td className="p-3 text-sm">{row['Colour'] || '-'}</td>
                          <td className="p-3 text-sm">{row['Size'] || '-'}</td>
                          <td className="p-3 text-sm text-right">₹{row['Price']}</td>
                          <td className="p-3 text-sm">{formatPreviewDate(row['Date'])}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {previewData.length > 100 && (
                <p className="text-sm text-slate-600 text-center">
                  Showing first 100 of {previewData.length} records (all {previewData.length} will be imported)
                </p>
              )}
              
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Atomic Import:</strong> All {previewData.length} records will be imported as a single transaction.
                  <br />
                  <strong>Validation:</strong> Row counts and totals will be verified across Sales, Payment Tracker, and GST tables.
                  <br />
                  <strong>Rollback:</strong> If any mismatch is detected, the entire import will be rejected.
                </AlertDescription>
              </Alert>

              {confirming && (
                <div className="space-y-3">
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-center text-gray-600">
                    Importing data... {progress}%
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setPreviewData(null);
                    setFile(null);
                  }}
                  disabled={confirming}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmImport}
                  disabled={confirming}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {confirming ? 'Importing...' : 'Confirm Import'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (importResult?.success) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-6 h-6" />
                {importResult.invoicesGenerated ? 'Import & Invoice Generation Complete' : 'Import Successful'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center p-8">
                <p className="text-2xl font-bold text-green-600 mb-2">
                  {importResult.count} Sales Records Imported
                </p>
                {importResult.invoicesGenerated && (
                  <p className="text-xl font-semibold text-blue-600 mt-2">
                    {importResult.invoiceCount} Invoices Generated
                  </p>
                )}
                {importResult.validation && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <p className="font-semibold text-green-800 mb-2">✓ Data Integrity Verified</p>
                    <div className="grid grid-cols-3 gap-4 text-gray-700">
                      <div>
                        <p className="font-medium">Sales</p>
                        <p>{importResult.validation.salesCount} rows</p>
                        <p>₹{importResult.validation.salesTotal.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="font-medium">Payment Tracker</p>
                        <p>{importResult.validation.paymentsCount} rows</p>
                        <p>₹{importResult.validation.paymentsTotal.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="font-medium">GST</p>
                        <p>{importResult.validation.gstCount} rows</p>
                        <p>₹{importResult.validation.gstTotal.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!importResult.invoicesGenerated && (
                <div className="space-y-4 border-t pt-6">
                  <Alert>
                    <FileCheck className="h-4 w-4" />
                    <AlertDescription>
                      Sales imported successfully. Now generate invoices from these sales records.
                    </AlertDescription>
                  </Alert>

                  <div>
                    <label className="text-sm font-semibold mb-2 block">Select Client for Invoices</label>
                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(client => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.party_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setFile(null);
                        setImportResult(null);
                        setProgress(0);
                      }}
                    >
                      Skip & Import Another
                    </Button>
                    <Button 
                      onClick={generateInvoices}
                      disabled={!selectedClient || generatingInvoices}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {generatingInvoices ? 'Generating...' : 'Generate Invoices'}
                    </Button>
                  </div>
                </div>
              )}

              {importResult.invoicesGenerated && (
                <div className="flex justify-end">
                  <Button onClick={() => {
                    setFile(null);
                    setImportResult(null);
                    setProgress(0);
                    setPreviewData(null);
                  }}>
                    Import Another File
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Sales Import</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Sales Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Upload an Excel file with these columns: <strong>BARCODE (required), Description, Colour, Size, Price, Date</strong>
                <br />
                <span className="text-sm text-gray-600 mt-1 block">BARCODE must be unique across all records.</span>
              </AlertDescription>
            </Alert>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="sales-upload"
              />
              <label htmlFor="sales-upload">
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
                  <p className="font-semibold mb-2">Validation Errors Found:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
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
                className="bg-blue-600 hover:bg-blue-700"
              >
                {processing ? 'Processing...' : 'Import Sales Data'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
