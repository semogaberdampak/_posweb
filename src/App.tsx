import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import { RequireAuth, RequirePerm } from './features/auth/guards'
import Layout from './features/layout/Layout'
import PosPage from './features/pos/PosPage'
import ProductsPage from './features/products/ProductsPage'
import UsersPage from './features/users/UsersPage'
import StockPage from './features/stock/StockPage'
import StockMovePage from './features/stock/StockMovePage'
import SettingsPage from './features/settings/SettingsPage'
import SalesRecapPage from './features/sales/SalesRecapPage'
import FinancePage from './features/finance/FinancePage'
import FormatNotaPage from './features/print/FormatNotaPage'


export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<RequirePerm feature="pos"><PosPage /></RequirePerm>} />
          <Route path="/produk" element={<RequirePerm feature="products"><ProductsPage /></RequirePerm>} />
          <Route path="/mutasi-stok" element={<RequirePerm feature="stock_move"><StockMovePage /></RequirePerm>} />
          <Route path="/stok" element={<RequirePerm feature="stock"><StockPage /></RequirePerm>} />
          <Route path="/laporan" element={<RequirePerm feature="sales_recap"><SalesRecapPage /></RequirePerm>} />
          <Route path="/keuangan" element={<RequirePerm feature="finance"><FinancePage /></RequirePerm>} />
          <Route path="/pengguna" element={<RequirePerm feature="users"><UsersPage /></RequirePerm>} />
          <Route path="/format-nota" element={<RequirePerm feature="settings"><FormatNotaPage /></RequirePerm>} />
          <Route path="/pengaturan" element={<RequirePerm feature="settings"><SettingsPage /></RequirePerm>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
