import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle, Download, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function BulkInvoiceUpload({ onSuccess, onCancel }) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [rawData, setRawData] = useState(null);
  const [columnMapping, setColumnMapping] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [groupedInvoices, setGroupedInvoices] = useState(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [createdInvoices, setCreatedInvoices] = useState([]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidationErrors([]);
      setRawData(null);
      setColumnMapping(null);
      setGroupedInvoices(null);
    }
  };

  const processFile = async () => {
    if (!file) return;
    
    setProcessing(true);
    setValidationErrors([]);
    
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            "Invoice Number": { type: "string" },
            "Customer Name": { type: "string" },
            "Invoice Date": { type: "string" },
            "Description": { type: "string" },
            "colour": { type: "string" },
            "color": { type: "string" },
            "Size": { type: "string" },
            "Price": { type: "number" },
            "Rate": { type: "number" },
            "Amount": { type: "number" },
            "Quantity": { type: "number" },
            "HSN Code": { type: "string" },
            "Unit": { type: "string" },
            "Model": { type: "string" }
          }
        }
      });

      if (result.status === "success" && result.output) {
        const rows = Array.isArray(result.output) ? result.output : [result.output];
        setRawData(rows);
        detectColumns(rows);
      } else {
        setValidationErrors([{ row: 0, message: 'Failed to parse Excel file' }]);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setValidationErrors([{ row: 0, message: 'Error processing file' }]);
    } finally {
      setProcessing(false);
    }
  };

  const detectColumns = (rows) => {
    if (!rows || rows.length === 0) return;
    
    const firstRow = rows[0];
    const columns = Object.keys(firstRow);
    
    const mapping = {
      invoice_number: null,
      customer_name: null,
      invoice_date: null,
      description: null,
      model: null,
      colour: null,
      size: null,
      hsn_code: null,
      quantity: null,
      unit: null,
      rate: null,
      price: null,
      amount: null
    };
    
    columns.forEach(col => {
      const original = col;
      
      if (original === 'Invoice Number') {
        mapping.invoice_number = original;
      } else if (original === 'Customer Name') {
        mapping.customer_name = original;
      } else if (original === 'Invoice Date') {
        mapping.invoice_date = original;
      } else if (original === 'Description') {
        mapping.model = original;
      } else if (original === 'Model') {
        mapping.model = original;
      } else if (original === 'colour' || original === 'color' || original === 'Colour' || original === 'Color') {
        mapping.colour = original;
      } else if (original === 'Size') {
        mapping.size = original;
      } else if (original === 'HSN Code' || original === 'HSN' || original === 'hsn') {
        mapping.hsn_code = original;
      } else if (original === 'Quantity' || original === 'Qty') {
        mapping.quantity = original;
      } else if (original === 'Unit') {
        mapping.unit = original;
      } else if (original === 'Price') {
        mapping.price = original;
      } else if (original === 'Rate') {
        mapping.rate = original;
      } else if (original === 'Amount') {
        mapping.amount = original;
      }
    });
    
    if (!mapping.price && mapping.rate) mapping.price = mapping.rate;
    if (!mapping.price && mapping.amount) mapping.price = mapping.amount;
    
    setColumnMapping(mapping);
  };

  const confirmMapping = () => {
    if (!rawData || !columnMapping) return;
    
    if (!columnMapping.invoice_number || !columnMapping.customer_name || 
        !columnMapping.invoice_date || !columnMapping.model || 
        !columnMapping.colour || !columnMapping.size || !columnMapping.price) {
      alert('All required columns must be present: Invoice Number, Customer Name, Invoice Date, Description/Model, Colour, Size, and Price');
      return;
    }
    
    validateAndGroupInvoices(rawData);
  };

  const validateAndGroupInvoices = (rows) => {
    const errors = [];
    const groups = {};

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      
      const invoiceNum = row[columnMapping.invoice_number];
      const customerName = row[columnMapping.customer_name];
      const invoiceDate = row[columnMapping.invoice_date];
      
      if (!invoiceNum) {
        errors.push({ row: rowNum, message: 'Missing invoice number' });
        return;
      }
      if (!customerName) {
        errors.push({ row: rowNum, message: 'Missing customer name' });
        return;
      }
      if (!invoiceDate) {
        errors.push({ row: rowNum, message: 'Missing invoice date' });
        return;
      }
      
      const parts = [];
      if (columnMapping.model && row[columnMapping.model]) {
        parts.push(row[columnMapping.model].toString().trim());
      }
      if (columnMapping.colour && row[columnMapping.colour]) {
        parts.push(row[columnMapping.colour].toString().trim());
      }
      if (columnMapping.size && row[columnMapping.size]) {
        parts.push(row[columnMapping.size].toString().trim());
      }
      
      const description = parts.join(' - ');
      
      if (!description || parts.length === 0) {
        errors.push({ row: rowNum, message: 'Missing model, colour, or size' });
        return;
      }
      
      const price = row[columnMapping.price] || row[columnMapping.rate] || row[columnMapping.amount];
      if (!price || price === 0) {
        errors.push({ row: rowNum, message: 'Missing or zero price/rate' });
        return;
      }

      const invoiceKey = invoiceNum.toString().trim();
      
      if (!groups[invoiceKey]) {
        groups[invoiceKey] = {
          invoice_number: invoiceKey,
          customer_name: customerName,
          invoice_date: invoiceDate,
          items: [],
          _order: index
        };
      }

      const quantity = row[columnMapping.quantity] || 1;
      const rate = row[columnMapping.price] || row[columnMapping.rate] || 0;
      const amount = row[columnMapping.amount] || (quantity * rate);

      groups[invoiceKey].items.push({
        description: description,
        hsn_code: row[columnMapping.hsn_code] || "640319",
        quantity: quantity,
        unit: row[columnMapping.unit] || "Pair",
        rate: rate,
        amount: amount,
        row_index: index
      });
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      setGroupedInvoices(null);
    } else {
      Object.keys(groups).forEach(key => {
        groups[key].items.sort((a, b) => a.row_index - b.row_index);
      });
      
      setGroupedInvoices(groups);
      setValidationErrors([]);
    }
  };

  const createAllInvoices = async () => {
    if (!groupedInvoices) return;
    
    setCreating(true);
    setProgress(0);
    const created = [];
    const invoiceKeys = Object.keys(groupedInvoices);
    const total = invoiceKeys.length;

    try {
      const [clients, companies] = await Promise.all([
        base44.entities.Client.list(),
        base44.entities.Company.list()
      ]);
      const company = companies.length > 0 ? companies[0] : null;

      for (let i = 0; i < invoiceKeys.length; i++) {
        const key = invoiceKeys[i];
        const group = groupedInvoices[key];
        
        let client = clients.find(c => 
          c.party_name.toLowerCase().includes(group.customer_name.toLowerCase()) ||
          group.customer_name.toLowerCase().includes(c.party_name.toLowerCase())
        );

        if (!client) {
          client = await base44.entities.Client.create({
            party_name: group.customer_name,
            address: "",
            gstin: "",
            state_name: "",
            state_code: ""
          });
        }

        const totalQuantity = group.items.reduce((sum, item) => sum + item.quantity, 0);
        const grandTotal = group.items.reduce((sum, item) => sum + item.amount, 0);
        
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

        const getFinancialYear = (date) => {
          const d = new Date(date);
          const month = d.getMonth();
          const year = d.getFullYear();
          if (month >= 3) {
            return `${year.toString().slice(2)}-${(year + 1).toString().slice(2)}`;
          }
          return `${(year - 1).toString().slice(2)}-${year.toString().slice(2)}`;
        };

        const financialYear = getFinancialYear(group.invoice_date);

        const invoice = await base44.entities.Invoice.create({
          invoice_number: group.invoice_number,
          ref_number: group.invoice_number,
          invoice_date: group.invoice_date,
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

        const itemsToCreate = group.items.map(item => ({
          ...item,
          invoice_id: invoice.id
        }));
        
        await base44.entities.InvoiceItem.bulkCreate(itemsToCreate);
        
        created.push(invoice);
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      setCreatedInvoices(created);
    } catch (error) {
      console.error('Error creating invoices:', error);
      alert('Error creating invoices: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const downloadAllPDFs = async () => {
    alert('Bulk PDF download will be available soon. For now, download PDFs individually from the invoice list.');
  };

  if (createdInvoices.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-6 h-6" />
            Invoices Created Successfully
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{createdInvoices.length}</p>
              <p className="text-sm text-gray-600">Invoices Created</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                ₹{createdInvoices.reduce((sum, inv) => sum + inv.grand_total, 0).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">Total Value</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <Badge>Draft</Badge>
              <p className="text-sm text-gray-600 mt-1">Status</p>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onSuccess}>
              View All Invoices
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (groupedInvoices) {
    const invoiceCount = Object.keys(groupedInvoices).length;
    const totalRows = Object.values(groupedInvoices).reduce((sum, inv) => sum + inv.items.length, 0);
    const totalValue = Object.values(groupedInvoices).reduce((sum, inv) => 
      sum + inv.items.reduce((s, item) => s + item.amount, 0), 0
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview & Confirm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              File validated successfully! Ready to create {invoiceCount} invoices.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-blue-600">{totalRows}</p>
              <p className="text-sm text-gray-600">Total Rows</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-green-600">{invoiceCount}</p>
              <p className="text-sm text-gray-600">Invoices to Create</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-purple-600">₹{totalValue.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Total Value</p>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-3 border-b">Invoice Number</th>
                  <th className="text-left p-3 border-b">Customer</th>
                  <th className="text-left p-3 border-b">Date</th>
                  <th className="text-center p-3 border-b">Items</th>
                  <th className="text-right p-3 border-b">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedInvoices).map(([key, invoice]) => (
                  <tr key={key} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{invoice.invoice_number}</td>
                    <td className="p-3">{invoice.customer_name}</td>
                    <td className="p-3">{(() => {
                      if (!invoice.invoice_date) return '-';
                      try {
                        const date = new Date(invoice.invoice_date);
                        return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : '-';
                      } catch (e) {
                        return '-';
                      }
                    })()}</td>
                    <td className="text-center p-3">{invoice.items.length}</td>
                    <td className="text-right p-3 font-semibold">
                      ₹{invoice.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {creating ? (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-gray-600">
                Creating invoices... {progress}%
              </p>
            </div>
          ) : (
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={createAllInvoices} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Create All Invoices
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (columnMapping && !groupedInvoices) {
    const mandatoryMissing = !columnMapping.invoice_number || !columnMapping.customer_name || 
                             !columnMapping.invoice_date || !columnMapping.model ||
                             !columnMapping.colour || !columnMapping.size ||
                             (!columnMapping.price && !columnMapping.rate && !columnMapping.amount);
    
    const sampleRows = rawData.slice(0, 3);
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Column Mapping Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {mandatoryMissing ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">Missing Required Columns:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  {!columnMapping.invoice_number && <li>Invoice Number</li>}
                  {!columnMapping.customer_name && <li>Customer Name</li>}
                  {!columnMapping.invoice_date && <li>Invoice Date</li>}
                  {!columnMapping.model && <li>Description or Model</li>}
                  {!columnMapping.colour && <li>Colour</li>}
                  {!columnMapping.size && <li>Size</li>}
                  {!columnMapping.price && !columnMapping.rate && !columnMapping.amount && <li>Price/Rate/Amount</li>}
                </ul>
                <p className="mt-2 text-xs">Please ensure your Excel file contains these columns.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All required columns detected. Please verify the mapping below.
              </AlertDescription>
            </Alert>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3 font-semibold border-b">Field</th>
                  <th className="text-left p-3 font-semibold border-b">Detected Column</th>
                  <th className="text-left p-3 font-semibold border-b">Sample Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3">Invoice Number</td>
                  <td className="p-3"><Badge variant={columnMapping.invoice_number ? "default" : "destructive"}>{columnMapping.invoice_number || 'Not Found'}</Badge></td>
                  <td className="p-3">{columnMapping.invoice_number && sampleRows[0]?.[columnMapping.invoice_number]}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Customer Name</td>
                  <td className="p-3"><Badge variant={columnMapping.customer_name ? "default" : "destructive"}>{columnMapping.customer_name || 'Not Found'}</Badge></td>
                  <td className="p-3">{columnMapping.customer_name && sampleRows[0]?.[columnMapping.customer_name]}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Invoice Date</td>
                  <td className="p-3"><Badge variant={columnMapping.invoice_date ? "default" : "destructive"}>{columnMapping.invoice_date || 'Not Found'}</Badge></td>
                  <td className="p-3">{columnMapping.invoice_date && sampleRows[0]?.[columnMapping.invoice_date]}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Description</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {columnMapping.model && <Badge variant="outline">{columnMapping.model}</Badge>}
                      {columnMapping.colour && <Badge variant="outline">{columnMapping.colour}</Badge>}
                      {columnMapping.size && <Badge variant="outline">{columnMapping.size}</Badge>}
                      {!columnMapping.model && <Badge variant="destructive">Model Not Found</Badge>}
                      {!columnMapping.colour && <Badge variant="destructive">Colour Not Found</Badge>}
                      {!columnMapping.size && <Badge variant="destructive">Size Not Found</Badge>}
                    </div>
                  </td>
                  <td className="p-3">
                    {[columnMapping.model && sampleRows[0]?.[columnMapping.model],
                      columnMapping.colour && sampleRows[0]?.[columnMapping.colour],
                      columnMapping.size && sampleRows[0]?.[columnMapping.size]].filter(Boolean).join(' - ')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Price/Rate</td>
                  <td className="p-3"><Badge variant={columnMapping.price || columnMapping.rate ? "default" : "destructive"}>{columnMapping.price || columnMapping.rate || 'Not Found'}</Badge></td>
                  <td className="p-3">{(columnMapping.price && sampleRows[0]?.[columnMapping.price]) || (columnMapping.rate && sampleRows[0]?.[columnMapping.rate])}</td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">Quantity</td>
                  <td className="p-3"><Badge variant="outline">{columnMapping.quantity || 'Default: 1'}</Badge></td>
                  <td className="p-3">{columnMapping.quantity && sampleRows[0]?.[columnMapping.quantity]}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setColumnMapping(null); setRawData(null); }}>
              Back
            </Button>
            <Button 
              onClick={confirmMapping} 
              disabled={mandatoryMissing}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirm & Validate
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Invoice Upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            Upload an Excel file with these columns: <strong>Invoice Number, Customer Name, Invoice Date, Description (or Model/Colour/Size), Price/Rate, Quantity</strong>
          </AlertDescription>
        </Alert>

        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
            id="bulk-upload"
          />
          <label htmlFor="bulk-upload">
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

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={processFile} 
            disabled={!file || processing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {processing ? 'Processing...' : 'Process File'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}