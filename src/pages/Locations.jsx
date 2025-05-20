import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import { TextField, Button, Paper, Typography, Box, Stack, Alert } from '@mui/material';
import { useAuth } from '../hooks/useAuth';

export default function Locations() {
  const { profile } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newLocation, setNewLocation] = useState({ name: '', address: '' });
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase.from('locations').select('*').order('name');
    if (error) setError(error.message);
    else setLocations(data);
    setLoading(false);
  }

  async function handleAddLocation(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newLocation.name.trim()) {
      setError('Location name is required.');
      return;
    }
    const { error } = await supabase.from('locations').insert([newLocation]);
    if (error) setError(error.message);
    else {
      setSuccess('Location added!');
      setNewLocation({ name: '', address: '' });
      fetchLocations();
    }
  }

  return (
    <Box maxWidth="md" mx="auto" mt={8}>
      <Paper elevation={0} sx={{ p: { xs: 2, md: 5 }, borderRadius: 4, boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)', border: '1px solid #eee', bgcolor: '#fff' }}>
        <Typography variant="h3" fontWeight={900} color="primary" mb={4} align="center" sx={{ letterSpacing: -1 }}>
          Locations
        </Typography>
        {isAdmin && (
          <form onSubmit={handleAddLocation} style={{ marginBottom: 32 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="Location Name"
                value={newLocation.name}
                onChange={e => setNewLocation({ ...newLocation, name: e.target.value })}
                required
                size="medium"
                sx={{ minWidth: 180 }}
              />
              <TextField
                label="Address"
                value={newLocation.address}
                onChange={e => setNewLocation({ ...newLocation, address: e.target.value })}
                size="medium"
                sx={{ minWidth: 220 }}
              />
              <Button type="submit" variant="contained" color="primary" disabled={loading} sx={{ borderRadius: 999, fontWeight: 700, px: 4 }}>
                Add Location
              </Button>
            </Stack>
          </form>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
        <Box mt={4}>
          {loading ? (
            <Typography color="text.secondary">Loading locations...</Typography>
          ) : locations.length === 0 ? (
            <Typography color="text.secondary">No locations found.</Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {locations.map(loc => (
                <Box component="li" key={loc.id} sx={{ mb: 2, p: 2, borderRadius: 3, bgcolor: '#fafbfc', border: '1px solid #e3e7ef', fontWeight: 700, fontSize: 18 }}>
                  <span style={{ fontWeight: 900 }}>{loc.name}</span>{loc.address ? <span style={{ color: '#888', fontWeight: 500 }}> — {loc.address}</span> : ''}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
} 