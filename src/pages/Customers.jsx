import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, Checkbox, CircularProgress, Alert, Snackbar, MenuItem
} from '@mui/material';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

function exportToCSV(customers) {
  if (!customers.length) return;
  const headers = [
    'AccountNumber',
    'CustomerListID',
    'customer_number',
    'barcode',
    'name',
    'contact_details',
    'phone',
  ];
  const rows = customers.map(c => [
    c.CustomerListID,
    c.CustomerListID,
    c.customer_number,
    c.barcode,
    c.name,
    c.contact_details,
    c.phone,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customers_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Customers({ profile }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ CustomerListID: '', name: '', contact_details: '', phone: '', location_id: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [locations, setLocations] = useState([]);
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState('');

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('customers').select('*').order('customer_number').limit(10000);
      if (error) setError(error.message);
      else setCustomers(data);
      setLoading(false);
    };
    fetchCustomers();
    // Fetch locations for dropdown
    const fetchLocations = async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (!error) setLocations(data);
    };
    fetchLocations();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.CustomerListID || !form.CustomerListID.trim()) {
      setError('CustomerListID is required.');
      return;
    }
    const { error } = await supabase.from('customers').insert([form]);
    if (error) setError(error.message);
    else {
      setForm({ CustomerListID: '', name: '', contact_details: '', phone: '', location_id: '' });
      const { data } = await supabase.from('customers').select('*').order('customer_number');
      setCustomers(data);
      setSuccessMsg('Customer added!');
    }
  };

  const handleEdit = (customer) => {
    setEditingId(customer.CustomerListID);
    setForm(customer);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.CustomerListID || !form.CustomerListID.trim()) {
      setError('CustomerListID is required.');
      return;
    }
    const { error } = await supabase.from('customers').update(form).eq('CustomerListID', editingId);
    if (error) setError(error.message);
    else {
      setEditingId(null);
      setForm({ CustomerListID: '', name: '', contact_details: '', phone: '', location_id: '' });
      const { data } = await supabase.from('customers').select('*').order('customer_number');
      setCustomers(data);
      setSuccessMsg('Customer updated!');
    }
  };

  const handleDelete = async (id) => {
    setError(null);
    const { error } = await supabase.from('customers').delete().eq('CustomerListID', id);
    if (error) setError(error.message);
    else {
      setCustomers(customers.filter(c => c.CustomerListID !== id));
      setSuccessMsg('Customer deleted!');
    }
  };

  const handleSelect = (id) => {
    setSelected(selected =>
      selected.includes(id) ? selected.filter(sid => sid !== id) : [...selected, id]
    );
  };

  const handleSelectAll = () => {
    if (selected.length === customers.length) {
      setSelected([]);
    } else {
      setSelected(customers.map(c => c.CustomerListID));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.length} selected customers? This cannot be undone.`)) return;
    setError(null);
    const { error } = await supabase.from('customers').delete().in('CustomerListID', selected);
    if (error) setError(error.message);
    else {
      setCustomers(customers.filter(c => !selected.includes(c.CustomerListID)));
      setSelected([]);
      setSuccessMsg('Selected customers deleted!');
    }
  };

  // Asset import handler
  const handleImportFile = e => {
    setImportError('');
    setImportResult('');
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setImportPreview(results.data);
        },
        error: (err) => setImportError(err.message)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = evt => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        setImportPreview(json);
      };
      reader.readAsArrayBuffer(file);
    } else {
      setImportError('Unsupported file type.');
    }
  };

  const handleImportSubmit = async () => {
    setImportError('');
    setImportResult('');
    if (!importPreview.length) return;
    // For each row, find customer and insert asset
    let successCount = 0;
    let failCount = 0;
    for (const row of importPreview) {
      const customerId = row['CustomerListID'] || row['customer_id'] || row['customer_number'];
      if (!customerId) { failCount++; continue; }
      // Find customer
      const customer = customers.find(c => c.CustomerListID === customerId || c.customer_number === customerId);
      if (!customer) { failCount++; continue; }
      // Prepare asset data
      const asset = {
        serial_number: row['serial_number'] || row['Serial Number'] || '',
        barcode_number: row['barcode_number'] || row['Barcode Number'] || '',
        gas_type: row['gas_type'] || row['Gas Type'] || '',
        assigned_customer: customer.CustomerListID,
        location_id: customer.location_id || null,
        category: row['category'] || row['Category'] || '',
        group_name: row['group_name'] || row['Group'] || '',
        type: row['type'] || row['Type'] || '',
        product_code: row['product_code'] || row['Product Code'] || '',
        description: row['description'] || row['Description'] || '',
        in_house_total: Number(row['in_house_total'] || row['In-House Total'] || 0),
        with_customer_total: Number(row['with_customer_total'] || row['With Customer Total'] || 0),
        lost_total: Number(row['lost_total'] || row['Lost Total'] || 0),
        total: Number(row['total'] || row['Total'] || 0),
        dock_stock: row['dock_stock'] || row['Dock Stock'] || '',
      };
      // Insert asset
      const { error } = await supabase.from('cylinders').insert([asset]);
      if (error) failCount++;
      else successCount++;
    }
    setImportResult(`Imported: ${successCount} assets. Failed: ${failCount}.`);
    setImportPreview([]);
  };

  if (loading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;
  if (error) return <Box p={4} color="error.main">Error: {error}</Box>;

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', bgcolor: '#fff', py: 6, px: { xs: 1, sm: 3, md: 6 } }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 1300, ml: 0, borderRadius: 4, p: { xs: 2, md: 4 }, boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)', border: '1px solid #eee', bgcolor: '#fff' }}>
        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} mb={5} gap={2}>
          <Typography variant="h3" fontWeight={900} color="primary" sx={{ letterSpacing: -1 }}>
            Customers
          </Typography>
          <Box display="flex" gap={2}>
            <Button variant="outlined" color="primary" onClick={() => exportToCSV(customers)} sx={{ borderRadius: 999, fontWeight: 700 }}>Export</Button>
            <Button variant="outlined" color="primary" onClick={() => navigate('/')} sx={{ borderRadius: 999, fontWeight: 700 }}>Dashboard</Button>
          </Box>
        </Box>
        {/* Search Bar */}
        <Box mb={4} maxWidth={400}>
          <TextField
            label="Search customers by name, ID, or phone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            fullWidth
            size="medium"
            sx={{ borderRadius: 2, bgcolor: '#fafbfc' }}
          />
        </Box>
        {canEdit && (
          <Box component="form" onSubmit={editingId ? handleUpdate : handleAdd} mb={4} display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField name="CustomerListID" value={form.CustomerListID} onChange={handleChange} label="CustomerListID" size="medium" required sx={{ minWidth: 160 }} />
            <TextField name="name" value={form.name} onChange={handleChange} label="Name" size="medium" sx={{ minWidth: 160 }} />
            <TextField name="contact_details" value={form.contact_details} onChange={handleChange} label="Address" size="medium" sx={{ minWidth: 160 }} />
            <TextField name="phone" value={form.phone} onChange={handleChange} label="Phone" size="medium" sx={{ minWidth: 140 }} />
            <TextField
              select
              name="location_id"
              value={form.location_id || ''}
              onChange={handleChange}
              label="Location"
              size="medium"
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">-- None --</MenuItem>
              {locations.map(loc => (
                <MenuItem key={loc.id} value={loc.id}>{loc.name}{loc.address ? ` — ${loc.address}` : ''}</MenuItem>
              ))}
            </TextField>
            <Button type="submit" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>{editingId ? 'Update' : 'Add'}</Button>
            {editingId && <Button type="button" onClick={() => { setEditingId(null); setForm({ CustomerListID: '', name: '', contact_details: '', phone: '', location_id: '' }); }} variant="outlined" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Cancel</Button>}
          </Box>
        )}
        {selected.length > 0 && (
          <Button onClick={handleBulkDelete} variant="contained" color="error" sx={{ mb: 2, borderRadius: 999, fontWeight: 700, px: 4 }}>
            Delete Selected ({selected.length})
          </Button>
        )}
        <TableContainer sx={{ borderRadius: 3, border: '1px solid #eee', boxShadow: 'none', mt: 2, width: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === customers.length && customers.length > 0}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>CustomerListID</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Name</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Address</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Phone</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Barcode</TableCell>
                <TableCell sx={{ px: 1, fontSize: 14 }}>Location</TableCell>
                {canEdit && <TableCell sx={{ px: 1, fontSize: 14 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.filter(c =>
                c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.CustomerListID?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.phone?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map((c, idx) => (
                <TableRow
                  key={c.CustomerListID}
                  hover
                  selected={highlightedId === c.CustomerListID}
                  style={{ cursor: 'pointer', transition: 'background 0.2s', borderRadius: 12 }}
                  onClick={() => navigate(`/customers/${c.CustomerListID}`)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(c.CustomerListID)}
                      onClick={e => { e.stopPropagation(); handleSelect(c.CustomerListID); }}
                    />
                  </TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.CustomerListID}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.name}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.contact_details}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.phone}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.barcode}</TableCell>
                  <TableCell sx={{ px: 1, fontSize: 14 }}>{c.location_id ? (locations.find(l => l.id === c.location_id)?.name || 'Unknown') : ''}</TableCell>
                  {canEdit && (
                    <TableCell sx={{ px: 1, fontSize: 14 }} onClick={e => e.stopPropagation()}>
                      <Button size="small" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 3, mr: 1 }} onClick={e => { e.stopPropagation(); handleEdit(c); }}>Edit</Button>
                      <Button size="small" variant="outlined" color="error" sx={{ borderRadius: 999, fontWeight: 700, px: 3 }} onClick={e => { e.stopPropagation(); handleDelete(c.CustomerListID); }}>Delete</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSuccessMsg('')} severity="success" sx={{ width: '100%' }}>{successMsg}</Alert>
        </Snackbar>
        {/* Import Assets by Customer Section */}
        <Box mt={6} p={4} sx={{ bgcolor: '#fafbfc', borderRadius: 3, border: '1px solid #e3e7ef', boxShadow: 'none' }}>
          <Typography variant="h6" fontWeight={800} color="primary" mb={2}>Import Assets by Customer</Typography>
          <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleImportFile} style={{ marginBottom: 16 }} />
          {importError && <Alert severity="error" sx={{ mb: 2 }}>{importError}</Alert>}
          {importPreview.length > 0 && (
            <Box mb={2}>
              <Typography fontWeight={700} mb={1}>Preview ({importPreview.length} rows):</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 600, bgcolor: '#fff', borderRadius: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>CustomerListID</TableCell>
                      <TableCell>Serial Number</TableCell>
                      <TableCell>Barcode Number</TableCell>
                      <TableCell>Gas Type</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Group</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Product Code</TableCell>
                      <TableCell>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importPreview.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row['CustomerListID'] || row['customer_id'] || row['customer_number']}</TableCell>
                        <TableCell>{row['serial_number'] || row['Serial Number']}</TableCell>
                        <TableCell>{row['barcode_number'] || row['Barcode Number']}</TableCell>
                        <TableCell>{row['gas_type'] || row['Gas Type']}</TableCell>
                        <TableCell>{row['category'] || row['Category']}</TableCell>
                        <TableCell>{row['group_name'] || row['Group']}</TableCell>
                        <TableCell>{row['type'] || row['Type']}</TableCell>
                        <TableCell>{row['product_code'] || row['Product Code']}</TableCell>
                        <TableCell>{row['description'] || row['Description']}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Button onClick={handleImportSubmit} variant="contained" color="primary" sx={{ mt: 2, borderRadius: 999, fontWeight: 700, px: 4 }}>Import</Button>
            </Box>
          )}
          {importResult && <Alert severity="success" sx={{ mt: 2 }}>{importResult}</Alert>}
        </Box>
      </Paper>
    </Box>
  );
}

export default Customers; 