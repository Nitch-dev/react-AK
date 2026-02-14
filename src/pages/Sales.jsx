import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
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
import { format } from "date-fns";

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteRecordConfirm, setDeleteRecordConfirm] = useState(null);
  const [deletingRecord, setDeletingRecord] = useState(false);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    setLoading(true);
    const data = await base44.entities.Sales.list('-created_date');
    setSales(data);
    setLoading(false);
  };

  const toggleBatch = (batchId) => {
    const newExpanded = new Set(expandedBatches);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpandedBatches(newExpanded);
  };

  // Group sales by import_batch_id
  const groupedSales = sales.reduce((acc, sale) => {
    const batchId = sale.import_batch_id || 'UNKNOWN';
    if (!acc[batchId]) {
      acc[batchId] = [];
    }
    acc[batchId].push(sale);
    return acc;
  }, {});

  const batches = Object.entries(groupedSales).map(([batchId, items]) => ({
    batchId,
    items,
    count: items.length,
    totalValue: items.reduce((sum, item) => sum + (item.price || 0), 0),
    importDate: items[0]?.sale_date
  }));

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'dd/MM/yyyy');
    } catch (e) {
      return '-';
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (!batch || !batch.batchId) {
      console.error('Invalid batch data');
      return;
    }
    
    setDeleting(true);
    
    try {
      const batchId = batch.batchId;
      
      const allSalesInBatch = await base44.entities.Sales.filter({ import_batch_id: batchId });
      const uniqueBarcodes = [...new Set(allSalesInBatch.map(s => s.barcode).filter(Boolean))];
      
      for (const barcode of uniqueBarcodes) {
        await base44.entities.PaymentTracker.filter({ barcode }).then(records => {
          return Promise.all(records.map(r => base44.entities.PaymentTracker.delete(r.id).catch(() => {})));
        }).catch(() => {});
        
        await base44.entities.GST.filter({ barcode }).then(records => {
          return Promise.all(records.map(r => base44.entities.GST.delete(r.id).catch(() => {})));
        }).catch(() => {});
      }
      
      await Promise.all(allSalesInBatch.map(sale => base44.entities.Sales.delete(sale.id).catch(() => {})));
      
      await loadSales();
    } catch (error) {
      console.error('Error deleting batch:', error);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleDeleteRecord = async (sale) => {
    if (!sale || !sale.barcode) {
      console.error('Invalid sale record');
      return;
    }
    
    setDeletingRecord(true);
    
    try {
      const barcode = sale.barcode;
      
      const paymentRecords = await base44.entities.PaymentTracker.filter({ barcode });
      await Promise.all(paymentRecords.map(r => base44.entities.PaymentTracker.delete(r.id).catch(() => {})));
      
      const gstRecords = await base44.entities.GST.filter({ barcode });
      await Promise.all(gstRecords.map(r => base44.entities.GST.delete(r.id).catch(() => {})));
      
      const invoiceItems = await base44.entities.InvoiceItem.filter({ barcode });
      const affectedInvoiceIds = [...new Set(invoiceItems.map(item => item.invoice_id))];
      await Promise.all(invoiceItems.map(item => base44.entities.InvoiceItem.delete(item.id).catch(() => {})));
      
      for (const invoiceId of affectedInvoiceIds) {
        const remainingItems = await base44.entities.InvoiceItem.filter({ invoice_id: invoiceId });
        if (remainingItems.length === 0) {
          await base44.entities.Invoice.delete(invoiceId).catch(() => {});
        }
      }
      
      await base44.entities.Sales.delete(sale.id);
      
      await loadSales();
    } catch (error) {
      console.error('Error deleting record:', error);
    } finally {
      setDeletingRecord(false);
      setDeleteRecordConfirm(null);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Sales Records</h1>
            <p className="text-slate-500 mt-1">View all imported sales data</p>
          </div>
          <div className="text-sm text-slate-600 bg-white/80 backdrop-blur px-4 py-2 rounded-xl shadow-md border border-slate-200">
            <span className="font-semibold text-blue-700">{batches.length}</span> Batches • 
            <span className="font-semibold text-emerald-700 ml-1">{sales.length}</span> Items
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-500">Loading sales records...</p>
            </CardContent>
          </Card>
        ) : batches.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sales records yet</h3>
              <p className="text-gray-500">Import sales data to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => {
              const isExpanded = expandedBatches.has(batch.batchId);
              
              return (
                <Card key={batch.batchId} className="overflow-hidden shadow-lg border-slate-200/60 bg-white/80 backdrop-blur hover:shadow-xl transition-all">
                  <button
                    onClick={() => toggleBatch(batch.batchId)}
                    className="w-full text-left hover:bg-slate-50/50 transition-all"
                  >
                    <CardHeader className="cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-blue-700" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-blue-700" />
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-lg font-bold text-slate-800">
                              Import {formatDate(batch.importDate)}
                            </CardTitle>
                            <p className="text-sm text-slate-600 mt-1">
                              <span className="font-semibold text-blue-700">{batch.count}</span> items • Total: <span className="font-semibold text-emerald-700">₹{batch.totalValue.toFixed(2)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-slate-400 font-mono bg-slate-100 px-3 py-1 rounded-lg">
                            {batch.batchId}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(batch);
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </button>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
                            <tr>
                              <th className="text-left p-3 text-sm font-semibold">Barcode</th>
                              <th className="text-left p-3 text-sm font-semibold">Description</th>
                              <th className="text-left p-3 text-sm font-semibold">Colour</th>
                              <th className="text-left p-3 text-sm font-semibold">Size</th>
                              <th className="text-right p-3 text-sm font-semibold">Price</th>
                              <th className="text-left p-3 text-sm font-semibold">Date</th>
                              <th className="text-center p-3 text-sm font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.items.map((sale, index) => (
                              <tr key={sale.id} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-all ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                <td className="p-3">
                                  <span className="font-mono text-sm font-semibold">{sale.barcode}</span>
                                </td>
                                <td className="p-3">
                                  <span className="text-sm">{sale.description}</span>
                                </td>
                                <td className="p-3">
                                  <span className="text-sm">{sale.colour}</span>
                                </td>
                                <td className="p-3">
                                  <span className="text-sm">{sale.size}</span>
                                </td>
                                <td className="p-3 text-right">
                                  <span className="font-semibold text-sm">₹{sale.price?.toFixed(2)}</span>
                                </td>
                                <td className="p-3">
                                  <span className="text-sm">{formatDate(sale.sale_date)}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteRecordConfirm(sale)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Import Batch</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this entire import batch ({deleteConfirm?.count} items)? 
                This will also delete all associated Payment Tracker and GST entries. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteBatch(deleteConfirm)}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'Deleting...' : 'Delete Batch'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteRecordConfirm !== null} onOpenChange={() => setDeleteRecordConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sales Record</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this sales record (Barcode: {deleteRecordConfirm?.barcode})? 
                This will also delete the associated Payment Tracker, GST, and Invoice Item entries. 
                If the invoice becomes empty, it will be deleted as well. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingRecord}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteRecord(deleteRecordConfirm)}
                disabled={deletingRecord}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingRecord ? 'Deleting...' : 'Delete Record'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}