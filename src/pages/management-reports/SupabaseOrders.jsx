import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase/client';
import {
  Box, Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, TextField, Alert, CircularProgress
} from '@mui/material';

const COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'invoice_number', label: 'Invoice/Receipt Number' },
  { key: 'gas_type', label: 'Gas Type' },
  { key: 'cylinder_type', label: 'Cylinder Type' },
  { key: 'qty_out', label: 'Qty Out' },
  { key: 'qty_in', label: 'Qty In' },
  { key: 'date', label: 'Date' },
  { key: 'scan_status', label: 'Scan Status' },
];

export default function SupabaseOrders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      // Fetch invoices, customers, line items, cylinders, and scans
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, customer_id, invoice_date, details');
      const { data: customers, error: custErr } = await supabase
        .from('customers')
        .select('CustomerListID, name');
      const { data: lineItems, error: liErr } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, product_code, description, qty_out, qty_in');
      const { data: cylinders, error: cylErr } = await supabase
        .from('cylinders')
        .select('product_code, type, description');
      // Try to fetch scans (scanned_sessions or similar)
      let scans = [];
      try {
        const { data: scanData } = await supabase
          .from('scanned_sessions')
          .select('order_number, product_code, scanned_at');
        scans = scanData || [];
      } catch {}
      if (invErr || custErr || liErr || cylErr) {
        setError(invErr?.message || custErr?.message || liErr?.message || cylErr?.message);
        setLoading(false);
        return;
      }
      const customerMap = {};
      for (const c of customers) customerMap[c.CustomerListID] = c.name;
      const invoiceMap = {};
      for (const inv of invoices) invoiceMap[inv.id] = inv;
      const cylinderMap = {};
      for (const cyl of cylinders) cylinderMap[cyl.product_code] = cyl;
      // Build rows: one per line item
      const tableRows = lineItems.map(li => {
        const inv = invoiceMap[li.invoice_id] || {};
        const cyl = cylinderMap[li.product_code] || {};
        // Scan status: look for a scan with matching order_number (details) and product_code
        const scanMatch = scans.find(s => s.order_number === inv.details && s.product_code === li.product_code);
        return {
          customer_id: inv.customer_id || '',
          customer_name: customerMap[inv.customer_id] || '',
          invoice_number: inv.details || '',
          gas_type: li.product_code || li.description || '',
          cylinder_type: cyl.type || cyl.description || '',
          qty_out: li.qty_out ?? '',
          qty_in: li.qty_in ?? '',
          date: inv.invoice_date || '',
          scan_status: scanMatch ? 'Scanned' : 'Not Scanned',
        };
      });
      setRows(tableRows);
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = rows.filter(row => {
    const s = search.toLowerCase();
    const matchesText =
      !search ||
      (row.customer_id && row.customer_id.toLowerCase().includes(s)) ||
      (row.customer_name && row.customer_name.toLowerCase().includes(s)) ||
      (row.invoice_number && row.invoice_number.toLowerCase().includes(s)) ||
      (row.gas_type && row.gas_type.toLowerCase().includes(s)) ||
      (row.cylinder_type && row.cylinder_type.toLowerCase().includes(s));
    let matchesDate = true;
    if (dateFrom) matchesDate = matchesDate && row.date && row.date >= dateFrom;
    if (dateTo) matchesDate = matchesDate && row.date && row.date <= dateTo;
    return matchesText && matchesDate;
  });

  return (
    <div className="max-w-6xl mx-auto mt-10 bg-white shadow-lg rounded-2xl p-8 border border-gray-200">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end md:gap-6 gap-3 mb-6">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Orders Report</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <input
                type="text"
                placeholder="Search customer, invoice #, gas type, cylinder type"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border border-gray-300 p-2 rounded text-sm w-56"
              />
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 p-2 rounded text-sm" />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 p-2 rounded text-sm" />
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 text-xs">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="border-b border-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 text-left whitespace-nowrap">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNS.length} className="py-8 text-center text-gray-500">Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={COLUMNS.length} className="py-8 text-center text-red-700">Error: {error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="py-8 text-center text-gray-500">No records found.</td></tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                    {COLUMNS.map(col => (
                      <td
                        key={col.key}
                        className={`px-2 py-1 text-xs text-gray-900 whitespace-nowrap ${col.key === 'scan_status' && row[col.key] === 'Not Scanned' ? 'bg-red-50 text-red-700 font-bold' : ''}`}
                      >
                        {row[col.key] || ''}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 