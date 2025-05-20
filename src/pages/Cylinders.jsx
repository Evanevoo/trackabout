import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Alert
} from '@mui/material';

function Cylinders({ profile }) {
  const [cylinders, setCylinders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ serial_number: '', barcode_number: '', gas_type: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignForm, setAssignForm] = useState({ customer_id: '', rental_start_date: '' });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCylinder, setSelectedCylinder] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [selected, setSelected] = useState([]);

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  const navigate = useNavigate();

  // Fetch cylinders and customers from Supabase
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch cylinders with customer details
        const { data: cylindersData, error: cylindersError } = await supabase
          .from('cylinders')
          .select(`
            *,
            assigned_customer (
              CustomerListID,
              name,
              customer_number
            )
          `)
          .order('serial_number');

        if (cylindersError) throw cylindersError;

        // Fetch customers for assignment dropdown
        const { data: customersData, error: customersError } = await supabase
          .from('customers')
          .select('CustomerListID, name, customer_number')
          .order('name');

        if (customersError) throw customersError;

        setCylinders(cylindersData);
        setCustomers(customersData);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('cylinders').insert([form]);
    if (error) setError(error.message);
    else {
      setForm({ serial_number: '', barcode_number: '', gas_type: '' });
      // Refresh list
      const { data } = await supabase
        .from('cylinders')
        .select('*, assigned_customer (CustomerListID, name, customer_number)')
        .order('serial_number');
      setCylinders(data);
    }
  };

  const handleEdit = (cylinder) => {
    setEditingId(cylinder.id);
    setForm({
      serial_number: cylinder.serial_number,
      barcode_number: cylinder.barcode_number,
      gas_type: cylinder.gas_type
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('cylinders').update(form).eq('id', editingId);
    if (error) setError(error.message);
    else {
      setEditingId(null);
      setForm({ serial_number: '', barcode_number: '', gas_type: '' });
      const { data } = await supabase
        .from('cylinders')
        .select('*, assigned_customer (CustomerListID, name, customer_number)')
        .order('serial_number');
      setCylinders(data);
    }
  };

  const handleDelete = async (id) => {
    setError(null);
    const { error } = await supabase.from('cylinders').delete().eq('id', id);
    if (error) setError(error.message);
    else {
      setCylinders(cylinders.filter(c => c.id !== id));
    }
  };

  const openAssignModal = (cylinder) => {
    setSelectedCylinder(cylinder);
    setAssignForm({
      customer_id: cylinder.assigned_customer?.CustomerListID || '',
      rental_start_date: cylinder.rental_start_date || new Date().toISOString().split('T')[0]
    });
    setShowAssignModal(true);
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    setError(null);
    let location_id = null;
    if (assignForm.customer_id) {
      // Find the assigned customer's location_id
      const customer = customers.find(c => c.CustomerListID === assignForm.customer_id);
      location_id = customer?.location_id || null;
    }
    const { error } = await supabase
      .from('cylinders')
      .update({
        assigned_customer: assignForm.customer_id || null,
        rental_start_date: assignForm.customer_id ? assignForm.rental_start_date : null,
        location_id: location_id
      })
      .eq('id', selectedCylinder.id);

    if (error) setError(error.message);
    else {
      setShowAssignModal(false);
      // Refresh list
      const { data } = await supabase
        .from('cylinders')
        .select('*, assigned_customer (CustomerListID, name, customer_number)')
        .order('serial_number');
      setCylinders(data);
    }
  };

  const handleImportFile = e => {
    setImportError(null);
    setImportResult(null);
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
    setImportError(null);
    setImportResult(null);
    if (!importPreview.length) return;
    const mapped = importPreview.map(row => ({
      category: row['Category'] || '',
      group_name: row['Group'] || '',
      type: row['Type'] || '',
      product_code: row['Product Code'] || '',
      description: row['Description'] || '',
      in_house_total: Number(row['In-House Total']) || 0,
      with_customer_total: Number(row['With Customer Total']) || 0,
      lost_total: Number(row['Lost Total']) || 0,
      total: Number(row['Total']) || 0,
      dock_stock: row['Dock Stock'] || '',
    }));
    // Deduplicate by product_code
    const deduped = Array.from(
      mapped.reduce((acc, item) => acc.set(item.product_code, item), new Map()).values()
    );
    const { error } = await supabase.from('cylinders').upsert(deduped, { onConflict: ['product_code'] });
    if (error) setImportError(error.message);
    else setImportResult('Assets imported!');
    setImportPreview([]);
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.length} selected assets? This cannot be undone.`)) return;
    setError(null);
    const { error } = await supabase.from('cylinders').delete().in('id', selected);
    if (error) setError(error.message);
    else {
      setCylinders(cylinders.filter(c => !selected.includes(c.id)));
      setSelected([]);
    }
  };

  if (loading) return <Box p={4} textAlign="center"><Typography>Loading cylinders...</Typography></Box>;
  if (error) return <Box p={4} color="error.main">Error: {error}</Box>;

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', bgcolor: '#fff', py: 6, px: { xs: 1, sm: 3, md: 6 } }}>
      <Paper elevation={0} sx={{ width: '100%', borderRadius: 4, p: { xs: 2, md: 5 }, boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)', border: '1px solid #eee', bgcolor: '#fff' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={5}>
          <Typography variant="h3" fontWeight={900} color="primary" sx={{ letterSpacing: -1 }}>
            Assets
          </Typography>
          <Button variant="outlined" color="primary" onClick={() => navigate('/')} sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Dashboard</Button>
        </Box>
        {/* Bulk Delete Buttons */}
        <Box mb={3} display="flex" gap={2}>
          {selected.length > 0 && (
            <Button onClick={handleBulkDelete} variant="contained" color="error" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>
              Delete Selected ({selected.length})
            </Button>
          )}
          {cylinders.length > 0 && (
            <Button
              onClick={async () => {
                if (!window.confirm('Delete ALL assets? This cannot be undone.')) return;
                setError(null);
                const { error } = await supabase.from('cylinders').delete();
                if (error) setError(error.message);
                else {
                  setCylinders([]);
                  setSelected([]);
                }
              }}
              variant="contained"
              color="error"
              sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}
            >
              Delete All
            </Button>
          )}
        </Box>
        {/* Import Assets Section */}
        <Box mb={6} p={4} sx={{ bgcolor: '#fafbfc', borderRadius: 3, border: '1px solid #e3e7ef', boxShadow: 'none' }}>
          <Typography variant="h6" fontWeight={800} color="primary" mb={2}>Import Assets</Typography>
          <TextField type="file" inputProps={{ accept: '.csv,.xlsx,.xls,.txt' }} onChange={handleImportFile} size="medium" sx={{ mb: 2, borderRadius: 2, bgcolor: '#fff' }} />
          {importError && <Alert severity="error" sx={{ mb: 2 }}>{importError}</Alert>}
          {importPreview.length > 0 && (
            <Box mb={2}>
              <Typography fontWeight={700} mb={1}>Preview ({importPreview.length} rows):</Typography>
              <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e3e7ef', boxShadow: 'none', mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Group</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Product Code</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>In-House Total</TableCell>
                      <TableCell>With Customer Total</TableCell>
                      <TableCell>Lost Total</TableCell>
                      <TableCell>Total</TableCell>
                      <TableCell>Dock Stock</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importPreview.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row['Category']}</TableCell>
                        <TableCell>{row['Group']}</TableCell>
                        <TableCell>{row['Type']}</TableCell>
                        <TableCell>{row['Product Code']}</TableCell>
                        <TableCell>{row['Description']}</TableCell>
                        <TableCell>{row['In-House Total']}</TableCell>
                        <TableCell>{row['With Customer Total']}</TableCell>
                        <TableCell>{row['Lost Total']}</TableCell>
                        <TableCell>{row['Total']}</TableCell>
                        <TableCell>{row['Dock Stock']}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Button onClick={handleImportSubmit} variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Import All</Button>
            </Box>
          )}
          {importResult && <Alert severity="success" sx={{ mt: 2 }}>{importResult}</Alert>}
        </Box>
        {canEdit && (
          <Box component="form" onSubmit={editingId ? handleUpdate : handleAdd} mb={4} display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField name="serial_number" value={form.serial_number} onChange={handleChange} label="Serial Number" size="medium" required sx={{ minWidth: 160 }} />
            <TextField name="barcode_number" value={form.barcode_number} onChange={handleChange} label="Barcode" size="medium" sx={{ minWidth: 160 }} />
            <TextField name="gas_type" value={form.gas_type} onChange={handleChange} label="Gas Type" size="medium" required sx={{ minWidth: 160 }} />
            <Button type="submit" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>{editingId ? 'Update' : 'Add'}</Button>
            {editingId && <Button type="button" onClick={() => { setEditingId(null); setForm({ serial_number: '', barcode_number: '', gas_type: '' }); }} variant="outlined" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Cancel</Button>}
          </Box>
        )}
        <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #eee', boxShadow: 'none', mt: 2 }}>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === cylinders.length && cylinders.length > 0}
                    onChange={() => {
                      if (selected.length === cylinders.length) setSelected([]);
                      else setSelected(cylinders.map(c => c.id));
                    }}
                  />
                </TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Group</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Product Code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>In-House Total</TableCell>
                <TableCell>With Customer Total</TableCell>
                <TableCell>Lost Total</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Dock Stock</TableCell>
                {canEdit && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {cylinders.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(c.id)}
                      onChange={() => {
                        setSelected(selected =>
                          selected.includes(c.id)
                            ? selected.filter(id => id !== c.id)
                            : [...selected, c.id]
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>{c.category}</TableCell>
                  <TableCell>{c.group_name}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.product_code}</TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell>{c.in_house_total}</TableCell>
                  <TableCell>{c.with_customer_total}</TableCell>
                  <TableCell>{c.lost_total}</TableCell>
                  <TableCell>{c.total}</TableCell>
                  <TableCell>{c.dock_stock}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button size="small" variant="contained" color="warning" sx={{ borderRadius: 999, fontWeight: 700, px: 3, mr: 1 }} onClick={() => handleEdit(c)}>Edit</Button>
                      <Button size="small" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 3, mr: 1 }} onClick={() => openAssignModal(c)}>Assign</Button>
                      <Button size="small" variant="outlined" color="error" sx={{ borderRadius: 999, fontWeight: 700, px: 3 }} onClick={() => handleDelete(c.id)}>Delete</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {/* Assignment Modal */}
      <Dialog open={showAssignModal} onClose={() => setShowAssignModal(false)}>
        <DialogTitle fontWeight={900}>Assign Cylinder</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleAssign} sx={{ mt: 2, minWidth: 320 }}>
            <TextField
              select
              label="Customer"
              value={assignForm.customer_id}
              onChange={e => setAssignForm({ ...assignForm, customer_id: e.target.value })}
              fullWidth
              sx={{ mb: 3 }}
            >
              <MenuItem value="">-- Unassign --</MenuItem>
              {customers.map(customer => (
                <MenuItem key={customer.CustomerListID} value={customer.CustomerListID}>
                  {customer.name} ({customer.customer_number})
                </MenuItem>
              ))}
            </TextField>
            {assignForm.customer_id && (
              <TextField
                type="date"
                label="Rental Start Date"
                value={assignForm.rental_start_date}
                onChange={e => setAssignForm({ ...assignForm, rental_start_date: e.target.value })}
                fullWidth
                required
                sx={{ mb: 3 }}
                InputLabelProps={{ shrink: true }}
              />
            )}
            <DialogActions>
              <Button onClick={() => setShowAssignModal(false)} variant="outlined" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Cancel</Button>
              <Button type="submit" variant="contained" color="primary" sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>Save</Button>
            </DialogActions>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default Cylinders; 