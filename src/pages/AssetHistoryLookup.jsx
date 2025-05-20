import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AssetHistoryLookup() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto mt-24 bg-white shadow-lg rounded-2xl p-8 border border-gray-200">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">Asset History Lookup</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Enter barcode or serial number..."
          className="border border-gray-300 bg-white p-3 rounded-lg w-full shadow-sm focus:ring-2 focus:ring-blue-300 transition text-sm"
        />
        <button
          onClick={() => search && navigate(`/assets/${search}/history`)}
          className="bg-blue-700 text-white px-5 py-2 rounded-full font-semibold shadow-sm hover:bg-blue-800 transition text-sm"
          disabled={!search}
        >
          Lookup
        </button>
      </div>
      <div className="text-xs text-gray-700">Quickly view the full history and details of any asset by barcode or serial number.</div>
    </div>
  );
} 