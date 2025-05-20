import React from 'react';
import { Box, Card, CardContent, Typography, Grid, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function Home({ profile }) {
  const navigate = useNavigate();
  return (
    <Box maxWidth="lg" mx="auto" mt={8}>
      <Box sx={{ width: '100%', maxWidth: 700, mx: 'auto' }}>
        <Card elevation={0} sx={{ borderRadius: 4, mb: 6, boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)', border: '1px solid #eee', bgcolor: '#fff' }}>
          <CardContent>
            <Typography variant="h3" fontWeight={900} color="primary" gutterBottom sx={{ letterSpacing: -1 }}>
              Dashboard
            </Typography>
            <Grid container spacing={3} mb={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ bgcolor: '#fafbfc', borderRadius: 3, border: '1px solid #e3e7ef', boxShadow: 'none' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ fontSize: 32, color: 'primary.main' }}>👤</Box>
                    <Box>
                      <Typography fontWeight={800} fontSize={20}>{profile?.full_name || 'User'}</Typography>
                      <Typography variant="caption" color="primary">Logged in</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ bgcolor: '#fafbfc', borderRadius: 3, border: '1px solid #e3e7ef', boxShadow: 'none' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ fontSize: 32, color: 'primary.main' }}>⭐</Box>
                    <Box>
                      <Typography fontWeight={800} fontSize={20} textTransform="capitalize">{profile?.role}</Typography>
                      <Typography variant="caption" color="primary">Role</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            {profile?.role === 'admin' && <Typography color="primary" fontWeight={700} mb={1}>You have full access to all features.</Typography>}
            {profile?.role === 'manager' && <Typography color="primary" fontWeight={700} mb={1}>You can view, assign cylinders, and generate invoices.</Typography>}
            {profile?.role === 'user' && <Typography color="primary" fontWeight={700} mb={1}>You have view-only access to customers and assigned cylinders.</Typography>}
            <Typography mt={3} color="text.secondary">Use the navigation bar to manage customers, cylinders, rentals, and invoices.</Typography>
            <Button variant="contained" color="primary" sx={{ mt: 5, borderRadius: 999, fontWeight: 700, px: 5, py: 1.5, fontSize: 18 }} onClick={() => navigate('/scanned-orders')}>
              View Scanned Orders
            </Button>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
} 