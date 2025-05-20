import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import { generateInvoicePDF, calculateRentalAmount } from '../utils/pdfGenerator';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress, Snackbar, Alert, MenuItem, Select, InputLabel, FormControl
} from '@mui/material';

function Invoices({ profile }) {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [manualEmail, setManualEmail] = useState('');
  const navigate = useNavigate();

  const canGenerate = profile?.role === 'admin' || profile?.role === 'manager';

  // Fetch invoices and customers
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch invoices with customer details
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select(`
            *,
            customer:customer_id (
              CustomerListID,
              name,
              customer_number
            ),
            generated_by_user:generated_by (
              full_name
            )
          `)
          .order('invoice_date', { ascending: false });

        if (invoicesError) throw invoicesError;

        // Fetch customers for invoice generation
        const { data: customersData, error: customersError } = await supabase
          .from('customers')
          .select('*')
          .order('name');

        if (customersError) throw customersError;

        setInvoices(invoicesData);
        setCustomers(customersData);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Reset manualEmail when opening modal
  useEffect(() => {
    if (showEmailModal && selectedInvoice) {
      const defaultEmail = selectedInvoice.customer?.email || selectedInvoice.customer?.contact_email || '';
      setManualEmail(defaultEmail);
    }
  }, [showEmailModal, selectedInvoice]);

  const handleGenerateInvoice = async (customerId) => {
    setGenerating(true);
    setError(null);
    try {
      // Get customer details
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('CustomerListID', customerId)
        .single();

      // Get active rentals for customer
      const { data: rentals } = await supabase
        .from('rentals')
        .select(`
          *,
          cylinder:cylinder_id (
            serial_number,
            gas_type
          )
        `)
        .eq('customer_id', customerId)
        .eq('status', 'active');

      if (!rentals?.length) {
        throw new Error('No active rentals found for this customer');
      }

      // Calculate amounts for each rental
      const rentalsWithAmounts = rentals.map(rental => ({
        ...rental,
        amount: calculateRentalAmount(rental)
      }));

      // Create invoice record
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([{
          customer_id: customerId,
          amount: rentalsWithAmounts.reduce((sum, r) => sum + r.amount, 0),
          invoice_date: new Date().toISOString().split('T')[0],
          generated_by: profile.id,
          rental_type: rentals[0].rental_type // Use first rental's type
        }])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Generate PDF
      const doc = generateInvoicePDF(invoice, customer, rentalsWithAmounts);
      
      // Save PDF to Blob and create URL
      const pdfBlob = doc.output('blob');
      const fileName = `invoice_${invoice.id}_${customer.customer_number}.pdf`;
      
      // Save file URL to invoice record
      const { error: storageError } = await supabase.storage
        .from('invoices')
        .upload(fileName, pdfBlob);

      if (storageError) throw storageError;

      // Update invoice with file URL
      const fileUrl = `${supabase.storage.from('invoices').getPublicUrl(fileName).data.publicUrl}`;
      await supabase
        .from('invoices')
        .update({ file_url: fileUrl })
        .eq('id', invoice.id);

      // Refresh invoices list
      const { data: refreshedInvoices } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customer_id (
            CustomerListID,
            name,
            customer_number
          ),
          generated_by_user:generated_by (
            full_name
          )
        `)
        .order('invoice_date', { ascending: false });

      setInvoices(refreshedInvoices);
      setShowGenerateModal(false);
      
      // Open PDF in new tab
      window.open(fileUrl, '_blank');
    } catch (err) {
      setError(err.message);
    }
    setGenerating(false);
  };

  const handleBulkGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Get all customers with active rentals
      const { data: activeRentals } = await supabase
        .from('rentals')
        .select('customer_id')
        .eq('status', 'active')
        .distinct();

      const customerIds = activeRentals.map(r => r.customer_id);
      
      // Generate invoice for each customer
      for (const customerId of customerIds) {
        await handleGenerateInvoice(customerId);
      }
    } catch (err) {
      setError(err.message);
    }
    setGenerating(false);
  };

  // Email invoice handler
  const handleEmailInvoice = async () => {
    setEmailing(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      let emailToSend = manualEmail;
      // If a new email is entered, always save it to the customer record
      if (manualEmail && selectedInvoice.customer?.CustomerListID) {
        const { error: updateError } = await supabase
          .from('customers')
          .update({ email: manualEmail })
          .eq('CustomerListID', selectedInvoice.customer.CustomerListID);
        if (updateError) throw new Error('Failed to save email: ' + updateError.message);
        // Update local state so next time it shows as saved
        setInvoices(invoices =>
          invoices.map(inv =>
            inv.customer?.CustomerListID === selectedInvoice.customer.CustomerListID
              ? { ...inv, customer: { ...inv.customer, email: manualEmail } }
              : inv
          )
        );
        emailToSend = manualEmail;
      }
      if (!emailToSend) throw new Error('Please enter an email address.');
      const res = await fetch('/.netlify/functions/emailInvoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailToSend,
          subject: `Your Rental Invoice #${selectedInvoice.id}`,
          text: `Dear ${selectedInvoice.customer?.name || ''},\n\nPlease find your rental invoice attached.\n\nThank you!`,
          pdfUrl: selectedInvoice.file_url,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEmailSuccess('Invoice emailed successfully!');
    } catch (err) {
      setEmailError(err.message);
    }
    setEmailing(false);
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;
  if (error) return <Box p={4} color="error.main">Error: {error}</Box>;

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', bgcolor: '#fff', py: 6, px: { xs: 1, sm: 3, md: 6 } }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 1300, ml: 0, borderRadius: 4, p: { xs: 2, md: 4 }, boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)', border: '1px solid #eee', bgcolor: '#fff' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={5}>
          <Typography variant="h3" fontWeight={900} color="primary" sx={{ letterSpacing: -1 }}>Invoices</Typography>
          <Button variant="outlined" color="primary" onClick={() => navigate('/')} sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Dashboard</Button>
        </Box>
        {/* Table of invoices */}
        <TableContainer sx={{ borderRadius: 3, border: '1px solid #eee', boxShadow: 'none', mt: 2, width: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ px: 1, fontSize: 14 }}>ID</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Customer</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Date</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Amount</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Rental Type</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>PDF</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Email</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{inv.id}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{inv.customer?.name}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{inv.invoice_date}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>${inv.amount?.toFixed(2)}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{inv.rental_type}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>
                    {inv.file_url ? <Button size="small" href={inv.file_url} target="_blank" sx={{ borderRadius: 999, fontWeight: 700, px: 3 }}>PDF</Button> : '—'}
                  </TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>
                    <Button size="small" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 3 }} onClick={() => { setSelectedInvoice(inv); setShowEmailModal(true); }}>Email</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {/* Email Modal */}
        <Dialog open={showEmailModal} onClose={() => setShowEmailModal(false)}>
          <DialogTitle fontWeight={900}>Email Invoice</DialogTitle>
          <DialogContent>
            <TextField
              label="Email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              fullWidth
              margin="normal"
            />
            {emailError && <Alert severity="error">{emailError}</Alert>}
            {emailSuccess && <Alert severity="success">{emailSuccess}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowEmailModal(false)} variant="outlined" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Cancel</Button>
            <Button onClick={handleEmailInvoice} disabled={emailing} variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>
              {emailing ? <CircularProgress size={20} /> : 'Send Email'}
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Box>
  );
}

export default Invoices; 