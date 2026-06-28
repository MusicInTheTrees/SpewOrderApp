import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingScreen from './components/LandingScreen';
import OrdersList from './components/OrdersList';

// Placeholders — replaced in later tasks
function OrderBuilder() { return <div>Order Builder</div>; }
function SettingsScreen() { return <div>Settings</div>; }

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/orders" element={<OrdersList />} />
        <Route path="/orders/:orderId" element={<OrderBuilder />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
