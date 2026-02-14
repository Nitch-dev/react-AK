import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Building2, Users, Edit, Trash2, Plus, AlertTriangle, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert"; 


export default function SettingsPage() {
  const [company, setCompany] = useState(null);
  const [companyFormData, setCompanyFormData] = useState({
    company_name: "ALK RESELL SHOES",
    company_code: "ALK",
    address: "",
    gstin: "",
    email: "",
    phone: "",
    state_name: "",
    state_code: ""
  });
  const [loading, setLoading] = useState(false);

  // Clients state
  const [clients, setClients] = useState([]);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientFormData, setClientFormData] = useState({
    party_name: "",
    address: "",
    gstin: "",
    state_name: "",
    state_code: "",
    email: "",
    phone: ""
  });

  // Delete all data state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadCompany();
    loadClients();
  }, []);

  const loadCompany = async () => {
    const companies = await base44.entities.Company.list();
    if (companies.length > 0) {
      const comp = companies[0];
      setCompany(comp);
      setCompanyFormData({
        company_name: comp.company_name || "",
        company_code: comp.company_code || "",
        address: comp.address || "",
        gstin: comp.gstin || "",
        email: comp.email || "",
        phone: comp.phone || "",
        state_name: comp.state_name || "",
        state_code: comp.state_code || ""
      });
    }
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (company) {
        await base44.entities.Company.update(company.id, companyFormData);
      } else {
        await base44.entities.Company.create(companyFormData);
      }
      await loadCompany();
    } catch (error) {
      console.error('Error saving company:', error);
    } finally {
      setLoading(false);
    }
  };

  // Client functions
  const loadClients = async () => {
    const data = await base44.entities.Client.list('-created_date');
    setClients(data);
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    if (editingClient) {
      await base44.entities.Client.update(editingClient.id, clientFormData);
    } else {
      await base44.entities.Client.create(clientFormData);
    }
    resetClientForm();
    loadClients();
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setClientFormData({
      party_name: client.party_name || "",
      address: client.address || "",
      gstin: client.gstin || "",
      state_name: client.state_name || "",
      state_code: client.state_code || "",
      email: client.email || "",
      phone: client.phone || ""
    });
    setShowClientForm(true);
  };

  const handleDeleteClient = async (id) => {

    if (confirm('Are you sure you want to delete this client?')) {
      
      await base44.entities.Client.delete(id);
      loadClients();
    }
  };

  const resetClientForm = () => {
    setClientFormData({
      party_name: "",
      address: "",
      gstin: "",
      state_name: "",
      state_code: "",
      email: "",
      phone: ""
    });
    setEditingClient(null);
    setShowClientForm(false);
  };

  // Delete all data function
  const handleDeleteAllData = async () => {
    if (deletePassword !== "DELETE123") {
      alert("Incorrect password!");
      return;
    }

    setDeleteLoading(true);
    try {
      // Delete all data from all entities
      const [invoices, sales, gst, payments, clients] = await Promise.all([
        base44.entities.Invoice.list(),
        base44.entities.Sales.list(),
        base44.entities.GST.list(),
        base44.entities.PaymentTracker.list(),
        base44.entities.Client.list()
      ]);

      // Delete invoice items first (due to foreign key)
      if (invoices.length > 0) {
        const allInvoiceItems = await base44.entities.InvoiceItem.list();
        await Promise.all(allInvoiceItems.map(item => base44.entities.InvoiceItem.delete(item.id)));
      }

      // Delete all records
      await Promise.all([
        ...invoices.map(inv => base44.entities.Invoice.delete(inv.id)),
        ...sales.map(sale => base44.entities.Sales.delete(sale.id)),
        ...gst.map(record => base44.entities.GST.delete(record.id)),
        ...payments.map(payment => base44.entities.PaymentTracker.delete(payment.id)),
        ...clients.map(client => base44.entities.Client.delete(client.id))
      ]);

      // Try to delete GST monthly status records
      try {
        const gstMonthly = await base44.entities.GSTMonthlyStatus.list();
        await Promise.all(gstMonthly.map(record => base44.entities.GSTMonthlyStatus.delete(record.id)));
      } catch (e) {
        console.log('No GST monthly records to delete');
      }

      setDeleteDialogOpen(false);
      setDeletePassword("");
      loadClients();
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('Failed to delete all data: ' + error.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Settings</h1>
          <p className="text-slate-500 mt-1">Manage your application settings and preferences</p>
        </div>

        <Tabs defaultValue="company" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company Info
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="danger" className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </TabsTrigger>
          </TabsList>

          {/* Company Info Tab */}
          <TabsContent value="company" className="space-y-4">
            <Card className="shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Company Information
                </CardTitle>
                <CardDescription>Update your company details and branding</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCompanySubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Company Name *</Label>
                      <Input
                        value={companyFormData.company_name}
                        onChange={(e) => setCompanyFormData({...companyFormData, company_name: e.target.value})}
                        required
                      />
                    </div>

                    <div>
                      <Label>Company Code *</Label>
                      <Input
                        value={companyFormData.company_code}
                        onChange={(e) => setCompanyFormData({...companyFormData, company_code: e.target.value.toUpperCase()})}
                        placeholder="ALK"
                        required
                        maxLength={10}
                      />
                      <p className="text-xs text-slate-500 mt-1">Used for invoice numbering (e.g., ALK/25-26/0001)</p>
                    </div>

                    <div></div>
                    
                    <div className="md:col-span-2">
                      <Label>Address</Label>
                      <Input
                        value={companyFormData.address}
                        onChange={(e) => setCompanyFormData({...companyFormData, address: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label>GSTIN</Label>
                      <Input
                        value={companyFormData.gstin}
                        onChange={(e) => setCompanyFormData({...companyFormData, gstin: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={companyFormData.email}
                        onChange={(e) => setCompanyFormData({...companyFormData, email: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={companyFormData.phone}
                        onChange={(e) => setCompanyFormData({...companyFormData, phone: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label>State Name</Label>
                      <Input
                        value={companyFormData.state_name}
                        onChange={(e) => setCompanyFormData({...companyFormData, state_name: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label>State Code</Label>
                      <Input
                        value={companyFormData.state_code}
                        onChange={(e) => setCompanyFormData({...companyFormData, state_code: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button type="submit" disabled={loading} className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg">
                      <Save className="w-4 h-4 mr-2" />
                      {loading ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4">
            <Card className="shadow-lg border-slate-200/60 bg-white/80 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Client Management
                    </CardTitle>
                    <CardDescription>Manage your client list and contact information</CardDescription>
                  </div>
                  <Dialog open={showClientForm} onOpenChange={setShowClientForm}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg">
                        <Plus className="w-4 h-4 mr-2" /> Add Client
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleClientSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Party Name *</Label>
                            <Input
                              value={clientFormData.party_name}
                              onChange={(e) => setClientFormData({...clientFormData, party_name: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>GSTIN</Label>
                            <Input
                              value={clientFormData.gstin}
                              onChange={(e) => setClientFormData({...clientFormData, gstin: e.target.value})}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Address</Label>
                            <Input
                              value={clientFormData.address}
                              onChange={(e) => setClientFormData({...clientFormData, address: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>State Name</Label>
                            <Input
                              value={clientFormData.state_name}
                              onChange={(e) => setClientFormData({...clientFormData, state_name: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>State Code</Label>
                            <Input
                              value={clientFormData.state_code}
                              onChange={(e) => setClientFormData({...clientFormData, state_code: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>Email</Label>
                            <Input
                              type="email"
                              value={clientFormData.email}
                              onChange={(e) => setClientFormData({...clientFormData, email: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>Phone</Label>
                            <Input
                              value={clientFormData.phone}
                              onChange={(e) => setClientFormData({...clientFormData, phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3">
                          <Button type="button" variant="outline" onClick={resetClientForm}>
                            Cancel
                          </Button>
                          <Button type="submit">
                            {editingClient ? 'Update' : 'Create'} Client
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {clients.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No clients yet</h3>
                    <p className="text-slate-500 mb-4">Add your first client to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clients.map(client => (
                      <Card key={client.id} className="hover:shadow-lg transition-shadow border-slate-200">
                        <CardHeader>
                          <CardTitle className="text-lg">{client.party_name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm mb-4">
                            {client.gstin && (
                              <div>
                                <span className="text-slate-500">GSTIN:</span>
                                <span className="ml-2 font-medium">{client.gstin}</span>
                              </div>
                            )}
                            {client.state_name && (
                              <div>
                                <span className="text-slate-500">State:</span>
                                <span className="ml-2 font-medium">{client.state_name} ({client.state_code})</span>
                              </div>
                            )}
                            {client.email && (
                              <div>
                                <span className="text-slate-500">Email:</span>
                                <span className="ml-2">{client.email}</span>
                              </div>
                            )}
                            {client.phone && (
                              <div>
                                <span className="text-slate-500">Phone:</span>
                                <span className="ml-2">{client.phone}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEditClient(client)}>
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteClient(client.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-4">
            <Card className="shadow-lg border-red-200 bg-red-50/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-red-600">
                  Irreversible actions that permanently affect your data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-white rounded-lg border-2 border-red-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-900 flex items-center gap-2">
                          <Shield className="w-5 h-5" />
                          Delete All Data
                        </h3>
                        <p className="text-sm text-red-700 mt-1">
                          Permanently delete all invoices, sales, GST records, payment trackers, and clients. This action cannot be undone.
                        </p>
                        <p className="text-xs text-red-600 mt-2 font-medium">
                          ⚠️ Password: DELETE123
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        className="bg-red-600 hover:bg-red-700 ml-4"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete All Data
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete All Data Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Delete All Data?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete ALL data from your application including:
                <ul className="list-disc ml-6 mt-2 space-y-1">
                  <li>All invoices and invoice items</li>
                  <li>All sales records</li>
                  <li>All GST records and monthly reports</li>
                  <li>All payment tracker data</li>
                  <li>All client information</li>
                </ul>
                <div className="mt-4">
                  <Label className="text-red-700 font-semibold">Enter password to confirm:</Label>
                  <Input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="DELETE123"
                    className="mt-2 border-red-300"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletePassword("")}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllData}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Everything'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}




