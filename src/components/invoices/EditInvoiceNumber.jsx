import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Edit2 } from "lucide-react";

export default function EditInvoiceNumber({ invoice, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Invoice.update(invoice.id, { 
        invoice_number: invoiceNumber,
        ref_number: invoiceNumber 
      });
      onUpdate();
      setOpen(false);
    } catch (error) {
      console.error('Error updating invoice number:', error);
      alert('Failed to update invoice number');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title="Edit Invoice Number"
      >
        <Edit2 className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Invoice Number</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Invoice Number"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !invoiceNumber}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}