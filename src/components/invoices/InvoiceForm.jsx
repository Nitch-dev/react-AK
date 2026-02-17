import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvoiceForm({ onSuccess }) {
  const [clients, setClients] = useState([]);
  const [company, setCompany] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [invoiceData, setInvoiceData] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    declaration_text: "1) The goods described in this invoice are pre-owned / second-hand goods supplied under the GST Margin Scheme in accordance with applicable provisions of the GST law.\n\n2) The invoice value represents the final and agreed transaction value between the parties under the Margin Scheme. Payment against this invoice shall be made in full as per the agreed terms and timelines.\n\n3) All particulars stated herein are true and correct to the best of our knowledge and belief at the time of issuance."
  });
  const [items, setItems] = useState([{
    description: "",
    hsn_code: "640319",
    quantity: 1,
    unit: "Pair",
    rate: 0,
    amount: 0
  }]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [clientsList, companyData] = await Promise.all([
      base44.entities.Client.list(),
      base44.entities.Company.list()
    ]);
    setClients(clientsList);
    if (companyData.length > 0) {
      setCompany(companyData[0]);
    }
  };

  const handleClientChange = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    
    if (field === 'quantity' || field === 'rate') {
      newItems[index].amount = (newItems[index].quantity || 0) * (newItems[index].rate || 0);
    }
    
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, {
      description: "",
      hsn_code: "640319",
      quantity: 1,
      unit: "Pair",
      rate: 0,
      amount: 0
    }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleFileImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            Description: { type: "string" },
            col_1: { type: "string" },
            Size: { type: "string" },
            price: { type: "number" }
          }
        }
      });

      if (result.status === "success" && result.output) {
        const dataArray = Array.isArray(result.output) ? result.output : [result.output];
        const importedItems = dataArray.map(item => ({
          description: `${item.Description}${item.col_1 ? ' - ' + item.col_1 : ''}${item.Size ? ' - ' + item.Size : ''}`,
          hsn_code: "640319",
          quantity: 1,
          unit: "Pair",
          rate: item.price || 0,
          amount: item.price || 0
        }));
        setItems(importedItems);
      } else {
        alert('Failed to extract data from file: ' + (result.details || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error importing file:', error);
      alert('Failed to import file');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const calculateTotals = () => {
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const grandTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    return { totalQuantity, grandTotal };
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

  const getFinancialYear = (date) => {
    const d = new Date(date);
    const month = d.getMonth();
    const year = d.getFullYear();
    if (month >= 3) {
      return `${year.toString().slice(2)}-${(year + 1).toString().slice(2)}`;
    }
    return `${(year - 1).toString().slice(2)}-${year.toString().slice(2)}`;
  };

const getNextInvoiceNumber = async (companyCode, financialYear) => {
  console.log("Filtering for financial_year:", financialYear);
  // Fetch all invoices for this financial year
  const invoices = await base44.entities.Invoice.filter({ financial_year: financialYear });
  console.log(`Found ${invoices.length} invoices for financial year ${financialYear}`);
  if (invoices.length === 0) {
    // No invoices yet for this financial year — start from 1
    return `${companyCode}/${financialYear}/1`;
  }

  // Extract the sequence number from each invoice number and find the highest
  // e.g. "ALK/2024-25/12" → 12
  const maxSequence = Math.max(
    ...invoices.map(inv => {
      const match = inv.invoice_number?.match(/\/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
  );

  return `${companyCode}/${financialYear}/${maxSequence + 1}`;
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient) {
      alert('Please select a client');
      return;
    }
    
    if (!company || !company.company_code) {
      alert('Please configure company code in settings first');
      return;
    }
    
    setLoading(true);
    try {
      const { totalQuantity, grandTotal } = calculateTotals();
      const financialYear = getFinancialYear(invoiceData.invoice_date);
      const invoiceNumber = await getNextInvoiceNumber(company.company_code, financialYear);
      
      const invoice = await base44.entities.Invoice.create({
        ...invoiceData,
        invoice_number: invoiceNumber,
        ref_number: invoiceNumber,
        financial_year: financialYear,
        client_id: selectedClient.id,
        client_name: selectedClient.party_name,
        client_address: selectedClient.address,
        client_gstin: selectedClient.gstin,
        client_state_name: selectedClient.state_name,
        client_state_code: selectedClient.state_code,
        total_quantity: totalQuantity,
        grand_total: grandTotal,
        amount_in_words: numberToWords(Math.floor(grandTotal)) + ' Rupees Only'
      });

      const itemsToCreate = items.map(item => ({
        ...item,
        invoice_id: invoice.id
      }));
      
      await base44.entities.InvoiceItem.bulkCreate(itemsToCreate);
      
      onSuccess();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const { totalQuantity, grandTotal } = calculateTotals();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Client</Label>
            <Select onValueChange={handleClientChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
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
          
          <div>
            <Label>Invoice Date</Label>
            <Input
              type="date"
              value={invoiceData.invoice_date}
              onChange={(e) => setInvoiceData({...invoiceData, invoice_date: e.target.value})}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Invoice number will be auto-generated</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('excel-upload').click()} disabled={importing}>
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importing...' : 'Import Excel'}
              </Button>
              <input
                id="excel-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileImport}
                className="hidden"
              />
              <Button type="button" onClick={addItem} size="sm">
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-3 p-4 border rounded-lg">
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    placeholder="Description of goods"
                    required
                  />
                </div>
                
                <div>
                  <Label>HSN Code</Label>
                  <Input
                    value={item.hsn_code}
                    onChange={(e) => handleItemChange(index, 'hsn_code', e.target.value)}
                    placeholder="HSN"
                  />
                </div>
                
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                    required
                  />
                </div>
                
                <div>
                  <Label>Unit</Label>
                  <Input
                    value={item.unit}
                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                    placeholder="Pair"
                  />
                </div>
                
                <div>
                  <Label>Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value))}
                    required
                  />
                </div>
                
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label>Amount</Label>
                    <Input value={item.amount.toFixed(2)} readOnly className="bg-gray-50" />
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="destructive" size="icon" onClick={() => removeItem(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg space-y-2">
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total Quantity:</span>
              <span className="font-bold">{totalQuantity}</span>
            </div>
            <div className="flex justify-between text-xl">
              <span className="font-medium">Grand Total:</span>
              <span className="font-bold">₹{grandTotal.toFixed(2)}</span>
            </div>
            <div className="text-sm text-gray-600">
              {numberToWords(Math.floor(grandTotal))} Rupees Only
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Declaration</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={invoiceData.declaration_text}
            onChange={(e) => setInvoiceData({...invoiceData, declaration_text: e.target.value})}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Creating...' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}
