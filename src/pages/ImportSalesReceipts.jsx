import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/client';
import * as XLSX from 'xlsx';
import { Box, Paper, Typography, Button, TextField, Alert, Select, MenuItem, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

const REQUIRED_FIELDS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'date', label: 'Date', aliases: ['txndate', 'txn_date'] },
  { key: 'product_code', label: 'Product Code' },
  { key: 'sales_receipt_number', label: 'Sales Receipt Number', aliases: ['refnumber', 'ref number', 'ref_no', 'ref no'] },
  { key: 'qty_out', label: 'Qty Out' },
  { key: 'qty_in', label: 'Qty In' },
];

const OPTIONAL_FIELDS = [
  { key: 'description', label: 'Description', aliases: ['desc', 'itemdesc', 'linedesc'] },
  { key: 'rate', label: 'Rate', aliases: ['rate', 'unitprice'] },
  { key: 'amount', label: 'Amount', aliases: ['amount', 'lineamount', 'total'] },
  { key: 'serial_number', label: 'Serial Number', aliases: ['serialnumber', 'serial'] },
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const MAPPING_STORAGE_KEY = 'importSalesReceiptsFieldMapping';

// Helper to get current user info from Supabase
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export default function ImportSalesReceipts() {
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [rowStatuses, setRowStatuses] = useState([]);
  const [previewChecked, setPreviewChecked] = useState(false);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [progress, setProgress] = useState(0);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [rentalAmount, setRentalAmount] = useState(0);
  const [rentalPeriod, setRentalPeriod] = useState('monthly');
  const [assetBalances, setAssetBalances] = useState({});
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const lastImportBalances = useRef({});

  function isHeaderRow(row) {
    return row.every(cell => typeof cell === 'string' && cell.length > 0 && !/^[0-9]+$/.test(cell));
  }

  function loadSavedMapping(detectedColumns) {
    try {
      const saved = localStorage.getItem(MAPPING_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed.columns && Array.isArray(parsed.columns) && JSON.stringify(parsed.columns) === JSON.stringify(detectedColumns)) {
        return parsed.mapping;
      }
    } catch {}
    return null;
  }

  const handleFileChange = e => {
    setFile(e.target.files[0]);
    setRawRows([]);
    setColumns([]);
    setMapping({});
    setPreview([]);
    setResult(null);
    setError(null);
    setRowStatuses([]);
    setPreviewChecked(false);
    setPreviewSummary(null);
    setValidationErrors([]);
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const processRows = (rows) => {
      if (!rows.length) return;
      let detectedColumns = [];
      let dataRows = rows;
      if (isHeaderRow(rows[0])) {
        detectedColumns = rows[0].map((col, i) => col.trim() || `Column ${i+1}`);
        dataRows = rows.slice(1);
      } else {
        detectedColumns = rows[0].map((_, i) => `Column ${i+1}`);
      }
      setRawRows(dataRows);
      setColumns(detectedColumns);
      const savedMapping = loadSavedMapping(detectedColumns);
      let autoMap = {};
      if (savedMapping) {
        autoMap = savedMapping;
      } else {
        ALL_FIELDS.forEach(field => {
          const found = detectedColumns.find(col => {
            const normCol = col.toLowerCase().replace(/\s|_/g, '');
            if (normCol.includes(field.key.replace(/_/g, ''))) return true;
            if (field.aliases) return field.aliases.some(alias => normCol.includes(alias));
            return false;
          });
          if (found) autoMap[field.key] = found;
        });
      }
      setMapping(autoMap);
      setPreview(generatePreview(dataRows, detectedColumns, autoMap));
    };
    if (ext === 'xls' || ext === 'xlsx') {
      const reader = new FileReader();
      reader.onload = evt => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        processRows(rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = evt => {
        const text = evt.target.result;
        const rows = text
          .split('\n')
          .map(line => line.split('\t'))
          .filter(row => row.length > 1 && row.some(cell => cell.trim() !== ''));
        processRows(rows);
      };
      reader.readAsText(file);
    }
  };

  function generatePreview(dataRows, detectedColumns, mappingObj) {
    return dataRows.map(row => {
      const mapped = {};
      ALL_FIELDS.forEach(field => {
        const colName = mappingObj[field.key];
        if (colName) {
          const colIdx = detectedColumns.indexOf(colName);
          let value = row[colIdx] || '';
          // If this is the product_code field, try to extract the code from ItemRefFullName if needed
          if (field.key === 'product_code' && value && value.includes(':')) {
            // Extract the last part after the last colon
            value = value.split(':').pop().trim();
          }
          mapped[field.key] = value;
        } else {
          mapped[field.key] = '';
        }
      });
      return mapped;
    });
  }

  const handleMappingChange = (fieldKey, colName) => {
    const newMapping = { ...mapping, [fieldKey]: colName };
    setMapping(newMapping);
    setPreview(generatePreview(rawRows, columns, newMapping));
    if (columns.length) {
      localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify({ columns, mapping: newMapping }));
    }
  };

  const handleResetMapping = () => {
    localStorage.removeItem(MAPPING_STORAGE_KEY);
    setMapping({});
    setPreview(generatePreview(rawRows, columns, {}));
  };

  function isValidDate(dateStr) {
    if (!dateStr) return false;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/');
      return d >= '01' && d <= '31' && m >= '01' && m <= '12' && y.length === 4;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return d >= '01' && d <= '31' && m >= '01' && m <= '12' && y.length === 4;
    }
    return false;
  }

  function validateRows(previewRows, mappingObj) {
    const errors = [];
    previewRows.forEach((row, idx) => {
      ALL_FIELDS.forEach(field => {
        if (!mappingObj[field.key]) {
          errors.push({ row: idx, field: field.key, reason: 'Field not mapped' });
        } else if (!row[field.key] || row[field.key].toString().trim() === '') {
          errors.push({ row: idx, field: field.key, reason: 'Missing value' });
        }
      });
      if (row.date && !isValidDate(row.date)) {
        errors.push({ row: idx, field: 'date', reason: 'Invalid date format' });
      }
      if (row.qty_out && isNaN(Number(row.qty_out))) {
        errors.push({ row: idx, field: 'qty_out', reason: 'Not a number' });
      }
      if (row.qty_in && isNaN(Number(row.qty_in))) {
        errors.push({ row: idx, field: 'qty_in', reason: 'Not a number' });
      }
    });
    return errors;
  }

  const handleImport = async e => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress(0);
    const validationErrors = validateRows(preview, mapping);
    if (validationErrors.length > 0) {
      setLoading(false);
      setError(`Validation failed: ${validationErrors.length} error(s) found. Please fix highlighted rows before importing.`);
      setValidationErrors(validationErrors);
      return;
    }
    let importHistoryId = null;
    let importUser = await getCurrentUser();
    let importStart = new Date().toISOString();
    try {
      const { data: importLog } = await supabase
        .from('import_history')
        .insert([{
          file_name: file?.name || '',
          import_type: 'sales_receipts',
          user_id: importUser?.id || null,
          user_email: importUser?.email || null,
          started_at: importStart,
          status: 'started'
        }])
        .select()
        .single();
      importHistoryId = importLog?.id;
    } catch {}

    let imported = 0, errors = 0;
    let customersCreated = 0, customersExisting = 0;
    let receiptsCreated = 0, receiptsExisting = 0;
    let lineItemsCreated = 0, lineItemsSkipped = 0;
    let skippedRows = [];
    try {
      if (!preview.length) throw new Error('No data to import.');
      const CHUNK_SIZE = 500;
      for (let chunkStart = 0; chunkStart < preview.length; chunkStart += CHUNK_SIZE) {
        const chunk = preview.slice(chunkStart, chunkStart + CHUNK_SIZE);

        // --- Bulk check for existing customers ---
        const customerIds = [...new Set(chunk.map(row => row.customer_id).filter(Boolean))];
        const { data: existingCustomers = [] } = await supabase
          .from('customers')
          .select('CustomerListID')
          .in('CustomerListID', customerIds);
        const existingCustomerIds = new Set((existingCustomers || []).map(c => c.CustomerListID));

        // --- Bulk insert new customers ---
        const newCustomers = chunk
          .filter(row => !existingCustomerIds.has(row.customer_id))
          .map(row => ({
            CustomerListID: row.customer_id,
            name: row.customer_name
          }));
        if (newCustomers.length) {
          await supabase.from('customers').insert(newCustomers);
          customersCreated += newCustomers.length;
        }
        customersExisting += customerIds.length - newCustomers.length;

        // --- Bulk check for existing receipts ---
        const receiptNumbers = [...new Set(chunk.map(row => row.sales_receipt_number).filter(Boolean))];
        const { data: existingReceipts = [] } = await supabase
          .from('invoices')
          .select('id, details')
          .in('details', receiptNumbers);
        const existingReceiptMap = new Map((existingReceipts || []).map(r => [r.details, r.id]));

        // --- Bulk insert new receipts ---
        const newReceipts = [];
        const receiptNumberToId = {};
        for (const row of chunk) {
          if (!existingReceiptMap.has(row.sales_receipt_number)) {
            let date = row.date;
            if (date && date.includes('/')) {
              const [day, month, year] = date.split('/');
              if (year && month && day) {
                date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
            }
            newReceipts.push({
              customer_id: row.customer_id,
              invoice_date: date,
              details: row.sales_receipt_number
            });
          }
        }
        if (newReceipts.length) {
          const { data: insertedReceipts = [] } = await supabase
            .from('invoices')
            .insert(newReceipts)
            .select();
          insertedReceipts.forEach(r => {
            receiptNumberToId[r.details] = r.id;
          });
          receiptsCreated += insertedReceipts.length;
        }
        receiptsExisting += receiptNumbers.length - newReceipts.length;

        // Merge all receipt IDs (existing + new)
        for (const r of existingReceipts) {
          receiptNumberToId[r.details] = r.id;
        }

        // --- Bulk fetch all needed descriptions for this chunk ---
        const descriptions = [...new Set(chunk.map(row => (row.description || '').trim()).filter(Boolean))];
        let validDescriptionSet = new Set();
        if (descriptions.length) {
          const { data: cylinders = [] } = await supabase
            .from('cylinders')
            .select('description');
          validDescriptionSet = new Set((cylinders || []).map(c => (c.description || '').trim().toLowerCase()));
        }

        // --- Bulk check for existing line items ---
        const lineItemChecks = [];
        for (const row of chunk) {
          const receiptId = receiptNumberToId[row.sales_receipt_number];
          if (receiptId && row.product_code) {
            lineItemChecks.push({ invoice_id: receiptId, product_code: row.product_code });
          }
        }
        let existingLineItems = [];
        if (lineItemChecks.length) {
          const uniquePairs = Array.from(new Set(lineItemChecks.map(
            li => `${li.invoice_id}|${li.product_code}`
          ))).map(pair => {
            const [invoice_id, product_code] = pair.split('|');
            return { invoice_id, product_code };
          });
          for (let i = 0; i < uniquePairs.length; i += 200) {
            const batch = uniquePairs.slice(i, i + 200);
            const { data: batchItems = [] } = await supabase
              .from('invoice_line_items')
              .select('invoice_id, product_code')
              .in('invoice_id', batch.map(b => b.invoice_id))
              .in('product_code', batch.map(b => b.product_code));
            existingLineItems = existingLineItems.concat(batchItems);
          }
        }
        const existingLineItemSet = new Set(existingLineItems.map(
          li => `${li.invoice_id}|${li.product_code}`
        ));

        // --- Bulk insert new line items ---
        const newLineItems = [];
        for (const row of chunk) {
          const receiptId = receiptNumberToId[row.sales_receipt_number];
          if (!receiptId) continue;
          const key = `${receiptId}|${row.product_code}`;
          if (existingLineItemSet.has(key)) {
            lineItemsSkipped++;
            skippedRows.push({ ...row, reason: 'Duplicate line item' });
            continue;
          }
          // Use in-memory check for description existence
          const desc = (row.description || '').trim().toLowerCase();
          if (!validDescriptionSet.has(desc)) {
            lineItemsSkipped++;
            skippedRows.push({ ...row, reason: 'Not a cylinder (by description)' });
            continue;
          }
          newLineItems.push({
            invoice_id: receiptId,
            product_code: row.product_code,
            qty_out: parseInt(row.qty_out, 10) || 0,
            qty_in: parseInt(row.qty_in, 10) || 0,
            description: row.description || null,
            rate: row.rate ? parseFloat(row.rate) : null,
            amount: row.amount ? parseFloat(row.amount) : null,
            serial_number: row.serial_number || null
          });
        }
        if (newLineItems.length) {
          await supabase.from('invoice_line_items').insert(newLineItems);
          imported += newLineItems.length;
          lineItemsCreated += newLineItems.length;
          // --- Assign imported assets to customers ---
          // For each imported line item, update the cylinder's assigned_customer
          // Build a map of product_code -> customer_id
          const assignments = {};
          // Track asset balances per customer
          const balances = {};
          for (const item of newLineItems) {
            if (item.product_code && item.invoice_id) {
              // Find the customer_id for this invoice
              const invoice = Object.entries(receiptNumberToId).find(([details, id]) => id === item.invoice_id);
              if (invoice) {
                const receiptNumber = invoice[0];
                // Find the row in chunk with this receipt number and product_code
                const row = chunk.find(r => r.sales_receipt_number === receiptNumber && r.product_code === item.product_code);
                if (row && row.customer_id) {
                  assignments[item.product_code] = row.customer_id;
                  // Track asset balance
                  const key = `${row.customer_id}|${item.product_code}`;
                  const qty = parseInt(row.qty_out, 10) || 0;
                  const qtyIn = parseInt(row.qty_in, 10) || 0;
                  balances[key] = (balances[key] || 0) + qty - qtyIn;
                }
              }
            }
          }
          // Batch update cylinders
          const updates = Object.entries(assignments).map(([product_code, customer_id]) =>
            supabase.from('cylinders').update({ assigned_customer: customer_id }).eq('product_code', product_code)
          );
          await Promise.all(updates);
          // Save balances for invoice generation
          setAssetBalances(balances);
          lastImportBalances.current = balances;
        }
        setProgress(Math.min(100, Math.round(((chunkStart + chunk.length) / preview.length) * 100)));
      }
      if (importHistoryId) {
        await supabase
          .from('import_history')
          .update({
            finished_at: new Date().toISOString(),
            status: 'success',
            summary: {
              imported,
              errors,
              customersCreated,
              customersExisting,
              receiptsCreated,
              receiptsExisting,
              lineItemsCreated,
              lineItemsSkipped,
              skippedRowsCount: skippedRows.length
            }
          })
          .eq('id', importHistoryId);
      }
      setResult({
        success: true,
        imported,
        errors,
        customersCreated,
        customersExisting,
        receiptsCreated,
        receiptsExisting,
        lineItemsCreated,
        lineItemsSkipped,
        skippedRows
      });
    } catch (err) {
      setError(err.message);
      if (importHistoryId) {
        await supabase
          .from('import_history')
          .update({
            finished_at: new Date().toISOString(),
            status: 'error',
            error_message: err.message
          })
          .eq('id', importHistoryId);
      }
    } finally {
      setLoading(false);
      setProgress(100);
    }
  };

  function downloadCSV(rows) {
    if (!rows.length) return;
    const header = Object.keys(rows[0]).join(',');
    const csv = [
      header,
      ...rows.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skipped_rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function checkPreviewStatuses() {
    setLoading(true);
    setError(null);
    setPreviewChecked(false);
    const statuses = [];
    let customersCreated = 0, customersExisting = 0;
    let receiptsCreated = 0, receiptsExisting = 0;
    let lineItemsCreated = 0, lineItemsSkipped = 0;
    // Batch fetch all unique customer IDs, receipt numbers, and product codes/types
    const customerIds = [...new Set(preview.map(row => row.customer_id).filter(Boolean))];
    const receiptNumbers = [...new Set(preview.map(row => row.sales_receipt_number).filter(Boolean))];
    const productCodes = [...new Set(preview.map(row => (row.product_code || '').trim()).filter(Boolean))];
    const types = [...new Set(preview.map(row => (row.type || '').trim()).filter(Boolean))];
    // Fetch all customers
    const { data: existingCustomers = [] } = await supabase
      .from('customers')
      .select('CustomerListID')
      .in('CustomerListID', customerIds);
    const existingCustomerIds = new Set((existingCustomers || []).map(c => c.CustomerListID));
    // Fetch all receipts
    const { data: existingReceipts = [] } = await supabase
      .from('invoices')
      .select('id, details')
      .in('details', receiptNumbers);
    const existingReceiptMap = new Map((existingReceipts || []).map(r => [r.details, r.id]));
    // Fetch all cylinders (by product_code and type)
    const { data: cylinders = [] } = await supabase
      .from('cylinders')
      .select('product_code, type');
    const validCylinderSet = new Set(
      (cylinders || []).flatMap(c => [
        (c.product_code || '').trim().toLowerCase(),
        (c.type || '').trim().toLowerCase()
      ])
    );
    // Prepare all (receipt, product_code) pairs for duplicate check
    const receiptProductPairs = preview.map(row => {
      const receiptId = existingReceiptMap.get(row.sales_receipt_number);
      return receiptId && row.product_code ? `${receiptId}|${row.product_code}` : null;
    }).filter(Boolean);
    // Batch fetch all existing line items
    let existingLineItems = [];
    for (let i = 0; i < receiptProductPairs.length; i += 200) {
      const batch = receiptProductPairs.slice(i, i + 200);
      const [invoiceIds, productCodes] = [
        batch.map(pair => pair.split('|')[0]),
        batch.map(pair => pair.split('|')[1])
      ];
      const { data: batchItems = [] } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, product_code')
        .in('invoice_id', invoiceIds)
        .in('product_code', productCodes);
      existingLineItems = existingLineItems.concat(batchItems);
    }
    const existingLineItemSet = new Set(existingLineItems.map(
      li => `${li.invoice_id}|${li.product_code}`
    ));
    // Now check each row in-memory
    for (let i = 0; i < preview.length; i++) {
      const row = preview[i];
      let customerStatus = 'New';
      let receiptStatus = 'New';
      let lineItemStatus = 'New';
      if (existingCustomerIds.has(row.customer_id)) {
        customerStatus = 'Existing';
        customersExisting++;
      } else {
        customersCreated++;
      }
      const receiptId = existingReceiptMap.get(row.sales_receipt_number);
      if (receiptId) {
        receiptStatus = 'Existing';
        receiptsExisting++;
      } else {
        receiptsCreated++;
      }
      // Check cylinder existence by product_code or type
      const code = (row.product_code || '').trim().toLowerCase();
      const type = (row.type || '').trim().toLowerCase();
      if (!validCylinderSet.has(code) && !validCylinderSet.has(type)) {
        lineItemStatus = 'Skipped (Not a cylinder)';
        lineItemsSkipped++;
      } else if (receiptId && existingLineItemSet.has(`${receiptId}|${row.product_code}`)) {
        lineItemStatus = 'Skipped (Duplicate)';
        lineItemsSkipped++;
      } else {
        lineItemsCreated++;
      }
      statuses.push({ customerStatus, receiptStatus, lineItemStatus });
    }
    setRowStatuses(statuses);
    setPreviewSummary({ customersCreated, customersExisting, receiptsCreated, receiptsExisting, lineItemsCreated, lineItemsSkipped });
    setPreviewChecked(true);
    setLoading(false);
  }

  // Load saved mapping on mount or when columns change
  useEffect(() => {
    if (columns.length) {
      const savedMapping = loadSavedMapping(columns);
      if (savedMapping) {
        setMapping(savedMapping);
        setPreview(generatePreview(rawRows, columns, savedMapping));
      }
    }
    // eslint-disable-next-line
  }, [columns]);

  return (
    <div className="max-w-3xl mx-auto mt-10 bg-white shadow-lg rounded-2xl p-8 border border-gray-200">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Import Sales Receipts</h2>
        <button
          onClick={() => navigate(-1)}
          className="bg-gray-900 text-white px-5 py-2 rounded-full font-semibold shadow-sm hover:bg-gray-700 transition"
        >
          Back
        </button>
      </div>
      <form onSubmit={handleImport} className="mb-6 flex gap-2 items-end">
        <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleFileChange} className="border border-gray-300 p-2 rounded w-full text-sm" />
        <button type="submit" className="bg-blue-700 text-white px-6 py-2 rounded-full font-semibold shadow-sm hover:bg-blue-800 transition text-sm" disabled={!file || !preview.length || loading || !previewChecked || validationErrors.length > 0}>{loading ? 'Importing...' : 'Import'}</button>
      </form>
      {/* Field Mapping UI */}
      {columns.length > 0 && (
        <div className="mb-6 bg-white rounded-xl p-4 border border-gray-100">
          <div className="font-semibold mb-2 flex items-center gap-4 text-gray-800">
            Field Mapping:
            <button
              type="button"
              className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full shadow-sm hover:bg-gray-200 text-xs font-semibold"
              onClick={handleResetMapping}
            >
              Reset Mapping
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALL_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-2">
                <label className="w-40 font-medium text-gray-900 text-sm">{field.label}{REQUIRED_FIELDS.find(f => f.key === field.key) ? '' : ' (optional)'}</label>
                <select
                  className="border border-gray-300 p-2 rounded w-full text-sm"
                  value={mapping[field.key] || ''}
                  onChange={e => handleMappingChange(field.key, e.target.value)}
                >
                  <option value="">-- Not Mapped --</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Preview Table */}
      {preview.length > 0 && (
        <div className="mb-6">
          <div className="font-semibold mb-2 text-gray-800">Preview ({preview.length} rows):</div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 text-xs">
              <thead>
                <tr>
                  {ALL_FIELDS.map(field => <th key={field.key} className="border-b border-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 text-left whitespace-nowrap">{field.label}</th>)}
                  <th className="border-b border-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 text-left">Customer</th>
                  <th className="border-b border-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 text-left">Receipt</th>
                  <th className="border-b border-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 text-left">Line Item</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 5).map((row, i) => {
                  const rowErrors = validationErrors.filter(e => e.row === i);
                  const status = rowStatuses[i] || {};
                  return (
                    <tr key={i} className={rowErrors.length ? 'bg-red-50' : ''}>
                      {ALL_FIELDS.map(field => {
                        const cellError = rowErrors.find(e => e.field === field.key);
                        return (
                          <td key={field.key} className={`px-2 py-1 text-xs whitespace-nowrap ${cellError ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-900'}`}>{row[field.key] || ''}</td>
                        );
                      })}
                      <td className="px-2 py-1 text-xs text-gray-700 whitespace-nowrap">{status.customerStatus || ''}</td>
                      <td className="px-2 py-1 text-xs text-gray-700 whitespace-nowrap">{status.receiptStatus || ''}</td>
                      <td className="px-2 py-1 text-xs text-gray-700 whitespace-nowrap">{status.lineItemStatus || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length > 5 && <div className="text-xs text-gray-500 mt-1">Showing first 5 rows only.</div>}
          </div>
          {validationErrors.length > 0 && (
            <div className="text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2">
              {validationErrors.length} validation error(s) found. Please fix highlighted rows before importing.
            </div>
          )}
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded-full font-semibold shadow-sm hover:bg-blue-800 transition mt-4 text-sm"
            onClick={checkPreviewStatuses}
            disabled={loading || validationErrors.length > 0}
          >
            {loading ? 'Checking...' : 'Check Preview'}
          </button>
        </div>
      )}
      {/* Preview Summary */}
      {previewChecked && previewSummary && (
        <div className="bg-gray-50 text-gray-900 p-4 rounded mb-4 border border-gray-100">
          <div className="font-semibold mb-1">Import Summary:</div>
          <div>Customers to create: {previewSummary.customersCreated}, already exist: {previewSummary.customersExisting}</div>
          <div>Receipts to create: {previewSummary.receiptsCreated}, already exist: {previewSummary.receiptsExisting}</div>
          <div>Line items to import: {previewSummary.lineItemsCreated}, skipped: {previewSummary.lineItemsSkipped}</div>
        </div>
      )}
      {result && (
        <div className="bg-green-50 text-green-900 p-4 rounded space-y-1 border border-green-100">
          <div>Import finished!</div>
          <div>Customers created: {result.customersCreated}, already existed: {result.customersExisting}</div>
          <div>Receipts created: {result.receiptsCreated}, already existed: {result.receiptsExisting}</div>
          <div>Line items imported: {result.lineItemsCreated}, skipped: {result.lineItemsSkipped}</div>
          <div>Total imported: {result.imported}, Errors: {result.errors}</div>
          {result.skippedRows && result.skippedRows.length > 0 && (
            <div className="mb-2">
              <button
                className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full shadow-sm hover:bg-gray-200 text-xs font-semibold mb-2"
                onClick={() => downloadCSV(result.skippedRows)}
              >
                Download Skipped Rows as CSV
              </button>
              <div className="text-xs text-red-700">
                <b>Unmatched Descriptions (first 10):</b>
                <ul>
                  {result.skippedRows.slice(0, 10).map((row, i) => (
                    <li key={i}>{row.unmatched_description}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      {loading && (
        <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
          <div
            className="bg-blue-700 h-3 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}
      {importing && (
        <div className="fixed bottom-4 right-4 bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm">
          Import in progress... You can navigate to another page. Import will continue in the background.<br />
          Progress: {importProgress}%
          {importErrors.length > 0 && <div className="text-red-200 mt-2">Errors: {importErrors.length}</div>}
        </div>
      )}
      {debugMode && (
        <div className="fixed bottom-0 right-0 bg-white border p-2 z-50 text-xs rounded shadow">
          <div>Status: {workerStatus.status}</div>
          <div>Progress: {workerStatus.progress}%</div>
          {workerStatus.error && <div className="text-red-500">Error: {workerStatus.error}</div>}
        </div>
      )}
      {skippedItems.length > 0 && (
        <button onClick={downloadSkippedItems} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full shadow-sm hover:bg-gray-200 text-xs font-semibold mb-2">Download Skipped Items Debug CSV</button>
      )}
    </div>
  );
} 