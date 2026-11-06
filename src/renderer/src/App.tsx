import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { AppLayout, Protegido } from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Produtos from '@/pages/Produtos'
import CategoriasUnidades from '@/pages/CategoriasUnidades'
import Movimentacoes from '@/pages/Movimentacoes'
import Compras from '@/pages/Compras'
import Fornecedores from '@/pages/Fornecedores'
import Clientes from '@/pages/Clientes'
import Usuarios from '@/pages/Usuarios'
import Relatorios from '@/pages/Relatorios'
import Vendas from '@/pages/Vendas'
import Inventario from '@/pages/Inventario'
import Configuracoes from '@/pages/Configuracoes'
import Perfil from '@/pages/Perfil'

// HashRouter porque, empacotado, o Electron carrega a interface via file://
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="vendas" element={<Protegido recurso="vendas"><Vendas /></Protegido>} />
              <Route path="produtos" element={<Protegido recurso="produtos"><Produtos /></Protegido>} />
              <Route path="categorias" element={<Protegido recurso="cadastros"><CategoriasUnidades /></Protegido>} />
              <Route path="estoque" element={<Protegido recurso="estoque"><Movimentacoes /></Protegido>} />
              <Route path="inventario" element={<Protegido recurso="estoque"><Inventario /></Protegido>} />
              <Route path="compras" element={<Protegido recurso="compras"><Compras /></Protegido>} />
              <Route path="fornecedores" element={<Protegido recurso="fornecedores"><Fornecedores /></Protegido>} />
              <Route path="clientes" element={<Protegido recurso="clientes"><Clientes /></Protegido>} />
              <Route path="relatorios" element={<Protegido recurso="relatorios"><Relatorios /></Protegido>} />
              <Route path="usuarios" element={<Protegido recurso="usuarios"><Usuarios /></Protegido>} />
              <Route path="configuracoes" element={<Protegido recurso="configuracoes"><Configuracoes /></Protegido>} />
              <Route path="perfil" element={<Perfil />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
