import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppBar, Box, CssBaseline, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Button } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import HistoryIcon from '@mui/icons-material/History';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ReportIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import UploadIcon from '@mui/icons-material/Upload';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabase/client';

const drawerWidth = 240;

const navItems = [
  { to: '/home', label: 'Home' },
  { to: '/customers', label: 'Customers' },
  { to: '/locations', label: 'Locations' },
  { to: '/assets/history-lookup', label: 'Asset History Lookup' },
  { to: '/all-asset-movements', label: 'All Asset Movements' },
  { to: '/import', label: 'Import' },
  { to: '/import-customer-info', label: 'Import Customers' },
  { to: '/import-history', label: 'Import History' },
  { to: '/scanned-orders', label: 'Scanned Orders' },
  { to: '/orders-report', label: 'Orders Report' },
  { to: '/cylinders', label: 'Assets' },
];

export default function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [logo, setLogo] = useState(null);
  const [logoUploadOpen, setLogoUploadOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  // Fetch logo from settings table on mount
  useEffect(() => {
    async function fetchLogo() {
      const { data, error } = await supabase
        .from('settings')
        .select('logo_url')
        .eq('id', 1)
        .single();
      if (data && data.logo_url) {
        setLogo(data.logo_url);
      }
    }
    fetchLogo();
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    console.log('Global search:', search);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Upload to Supabase Storage (upsert: true allows replacing the logo)
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload('company-logo.png', file, { upsert: true });
    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      return;
    }
    // Get public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('logos')
      .getPublicUrl('company-logo.png');
    const logoUrl = publicUrlData.publicUrl;
    // Save URL to settings table (assuming id=1 for the single settings row)
    const { error: updateError } = await supabase
      .from('settings')
      .update({ logo_url: logoUrl })
      .eq('id', 1);
    if (updateError) {
      alert('Failed to save logo URL: ' + updateError.message);
      return;
    }
    setLogo(logoUrl);
  };

  const drawer = (
    <div style={{ background: '#fff', height: '100%' }}>
      <Toolbar>
        {logo && <img src={logo} alt="Company Logo" style={{ height: 36, marginRight: 12, borderRadius: 8 }} />}
        <Typography variant="h5" fontWeight={900} sx={{ fontFamily: 'Inter, Montserrat, system-ui', color: '#111' }}>
          LessAnnoyingScan
        </Typography>
        {profile?.role === 'admin' && (
          <label style={{ marginLeft: 8, cursor: 'pointer' }} title="Upload Logo">
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <UploadIcon fontSize="small" style={{ verticalAlign: 'middle' }} />
          </label>
        )}
      </Toolbar>
      <Divider />
      <List>
        {navItems.map(({ to, label }) => (
          <ListItem key={to} disablePadding>
            <ListItemButton selected={location.pathname === to} onClick={() => navigate(to)} sx={{ px: 3 }}>
              <ListItemText primary={<Typography fontWeight={location.pathname === to ? 700 : 500} sx={{ color: '#111', fontSize: 18 }}>{label}</Typography>} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#fff', fontFamily: 'Inter, Montserrat, system-ui' }}>
      <CssBaseline />
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#fff', color: '#111', boxShadow: 'none', borderBottom: '1px solid #eee' }}>
        <Toolbar sx={{ minHeight: 72 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <span style={{ fontSize: 28, fontWeight: 900 }}>≡</span>
          </IconButton>
          {logo && <img src={logo} alt="Company Logo" style={{ height: 36, marginRight: 12, borderRadius: 8 }} />}
          <Typography variant="h5" fontWeight={900} sx={{ fontFamily: 'Inter, Montserrat, system-ui', color: '#111', mr: 4 }}>
            LessAnnoyingScan
          </Typography>
          {profile?.role === 'admin' && (
            <label style={{ marginRight: 16, cursor: 'pointer' }} title="Upload Logo">
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              <UploadIcon fontSize="small" style={{ verticalAlign: 'middle' }} />
            </label>
          )}
          <Box component="form" onSubmit={handleGlobalSearch} sx={{ flexGrow: 1, maxWidth: 400, mx: 2 }}>
            <input
              type="text"
              placeholder="Search customers, orders, cylinders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid #ddd',
                fontSize: 16,
                fontFamily: 'inherit',
                outline: 'none',
                background: '#fafbfc',
                color: '#111',
                boxSizing: 'border-box',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Button color="inherit" onClick={() => navigate('/home')}>Home</Button>
            <Button color="inherit" onClick={() => navigate('/rentals')}>Rentals</Button>
            <Button color="inherit" onClick={() => navigate('/invoices')}>Invoices</Button>
            <Button color="inherit" onClick={() => navigate('/customers')}>Customers</Button>
            <Button color="inherit" onClick={() => navigate('/scanned-orders')}>Scanned Orders</Button>
            <IconButton color="inherit" onClick={() => navigate('/settings')}>
              <SettingsIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="mailbox folders"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, bgcolor: '#fff' },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, bgcolor: '#fff' },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 4, width: { sm: `calc(100% - ${drawerWidth}px)` }, bgcolor: '#fff', minHeight: '100vh', fontFamily: 'Inter, Montserrat, system-ui' }}
      >
        <Toolbar sx={{ minHeight: 72 }} />
        <Outlet />
      </Box>
    </Box>
  );
} 