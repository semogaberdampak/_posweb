import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import { RequireAuth, RequirePerm } from './features/auth/guards'
import Layout from './features/layout/Layout'
import PosPage from './features/pos/PosPage'
import ProductsPage from './features/products/ProductsPage'
import StockPage from './features/stock/StockPage'
import StockMovePage from './features/stock-move/StockMovePage'
import SettingsPage from './features/settings/SettingsPage'

const Soon = ({ title }: { title: string }) => <div className="p-6 text-xl">{title} — segera hadir</div>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<RequirePerm feature="pos"><PosPage /></RequirePerm>} />
          <Route path="/produk" element={<RequirePerm feature="products"><ProductsPage /></RequirePerm>} />
          <Route path="/stok" element={<RequirePerm feature="stock"><StockPage /></RequirePerm>} />
          <Route path="/stok-move" element={<RequirePerm feature="stock_move"><StockMovePage /></RequirePerm>} />
          <Route path="/laporan" element={<RequirePerm feature="sales_recap"><Soon title="Rekap Penjualan" /></RequirePerm>} />
          <Route path="/keuangan" element={<RequirePerm feature="finance"><Soon title="Keuangan" /></RequirePerm>} />
          <Route path="/pengguna" element={<RequirePerm feature="users"><Soon title="Pengguna & Role" /></RequirePerm>} />
          <Route path="/pengaturan" element={<RequirePerm feature="settings"><SettingsPage /></RequirePerm>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
