import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, AlertCircle, CheckCircle, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PaymentImportPage() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [previewData, setPreviewData] = useState(null);
  const [confirming, setConfirming] = useState(false);

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
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setProgress(20);
      
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            "BARCODE": { type: "string" },
            "AMOUNT PAID": { type: "number" },
            "PAYMENT DATE": { type: "string" }
          }
        }
      });

      setProgress(40);

      if (result.status === "success" && result.output) {
        const rows = Array.isArray(result.output) ? result.output : [result.output];
        setPreviewData(rows);
        setProgress(50);
      } else {
        setValidationErrors([{ row: 0, message: 'Failed to parse Excel file' }]);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setValidationErrors([{ row: 0, message: 'Error processing file: ' + error.message }]);
    } finally {
      setProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!previewData) return;
    
    setConfirming(true);
    setProgress(60);
    
    try {
      await processPayments(previewData);
    } catch (error) {
      console.error('Error importing payments:', error);
      setValidationErrors([{ row: 0, message: 'Error importing: ' + error.message }]);
      setConfirming(false);
    }
  };

  const processPayments = async (rows) => {
    const errors = [];
    let matched = 0;
    let notFound = 0;

    setProgress(70);

    for (const row of rows) {
      const barcode = row['BARCODE'];
      const amountPaid = row['AMOUNT PAID'] || 0;
      const rawPaymentDate = row['PAYMENT DATE'];

      if (!barcode) {
        errors.push({ message: 'Missing BARCODE in row' });
        continue;
      }

      // Parse payment date
      let paymentDate;
      if (!rawPaymentDate) {
        paymentDate = new Date().toISOString().split('T')[0];
      } else if (typeof rawPaymentDate === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        paymentDate = new Date(excelEpoch.getTime() + rawPaymentDate * 86400000).toISOString().split('T')[0];
      } else {
        const testDate = new Date(rawPaymentDate);
        paymentDate = !isNaN(testDate.getTime()) 
          ? testDate.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
      }

      // Find matching payment tracker entry
      const trackerEntries = await base44.entities.PaymentTracker.filter({ barcode: barcode.toString().trim() });
      
      if (trackerEntries.length === 0) {
        notFound++;
        errors.push({ message: `Barcode ${barcode} not found in payment tracker` });
        continue;
      }

      const tracker = trackerEntries[0];
      const newReceivedAmount = tracker.received_amount + amountPaid;
      const newBalance = tracker.sale_amount - newReceivedAmount;
      
      let newStatus;
      if (newReceivedAmount === 0) {
        newStatus = "unpaid";
      } else if (newReceivedAmount < tracker.sale_amount) {
        newStatus = "partial";
      } else {
        newStatus = "paid";
      }

      await base44.entities.PaymentTracker.update(tracker.id, {
        received_amount: newReceivedAmount,
        balance: newBalance,
        status: newStatus,
        payment_date: paymentDate
      });

      matched++;
    }

    setProgress(100);
    setImportResult({
      success: true,
      matched,
      notFound,
      total: rows.length
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
    }
    
    setConfirming(false);
  };

  if (previewData && !importResult) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-600" />
                Confirm Payment Import - {previewData.length} Records Found
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Review the payment data below and click "Confirm Import" to proceed with updating {previewData.length} payment records.
                </AlertDescription>
              </Alert>

              <div className="border-2 border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-sm font-semibold">Barcode</th>
                      <th className="text-right p-3 text-sm font-semibold">Amount Paid</th>
                      <th className="text-left p-3 text-sm font-semibold">Payment Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50">
                        <td className="p-3 text-sm font-mono">{row['BARCODE']}</td>
                        <td className="p-3 text-sm text-right font-semibold">₹{row['AMOUNT PAID'] || 0}</td>
                        <td className="p-3 text-sm">{row['PAYMENT DATE'] ? new Date(row['PAYMENT DATE']).toLocaleDateString() : 'Today'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {confirming && (
                <div className="space-y-3">
                  <Progress value={progress} className="h-2" />
                  <p className="text-sm text-center text-gray-600">
                    Processing payments... {progress}%
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
                Payment Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-blue-600">{importResult.total}</p>
                  <p className="text-sm text-gray-600">Total Records</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.matched}</p>
                  <p className="text-sm text-gray-600">Matched & Updated</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-600">{importResult.notFound}</p>
                  <p className="text-sm text-gray-600">Not Found</p>
                </div>
              </div>

              {validationErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold mb-2">Errors:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {validationErrors.map((error, idx) => (
                        <p key={idx} className="text-xs">{error.message}</p>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button onClick={() => {
                  setFile(null);
                  setImportResult(null);
                  setProgress(0);
                  setValidationErrors([]);
                  setPreviewData(null);
                }}>
                  Import Another File
                </Button>
              </div>
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
          <h1 className="text-3xl font-bold">Payment Import</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Daily Payment Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Upload an Excel file with these columns: <strong>BARCODE (required), AMOUNT PAID, PAYMENT DATE</strong>
              </AlertDescription>
            </Alert>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="payment-upload"
              />
              <label htmlFor="payment-upload">
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
                      <p key={idx} className="text-xs">{error.message}</p>
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
                {processing ? 'Processing...' : 'Import Payments'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}