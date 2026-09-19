import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./stores/authStore";
import { homeFor } from "./lib/roles";
import ShopLayout from "./layouts/ShopLayout";
import AdminLayout from "./layouts/AdminLayout";
import HomePage from "./features/shop/HomePage";
import CatalogPage from "./features/shop/CatalogPage";
import ProductPage from "./features/shop/ProductPage";
import CartPage from "./features/shop/CartPage";
import CheckoutPage from "./features/shop/CheckoutPage";
import MyOrdersPage from "./features/shop/MyOrdersPage";
import ShopAuthPage from "./features/shop/ShopAuthPage";
import AccountPage from "./features/shop/AccountPage";
import PosPage from "./features/pos/PosPage";
import ScannerPage from "./features/scanner/ScannerPage";
import BankDemo from "./features/pos/BankDemo";
import Dashboard from "./features/reports/Dashboard";
import ProductsPage from "./features/products/ProductsPage";
import InventoryPage from "./features/inventory/InventoryPage";
import ReceiptsPage from "./features/inventory/ReceiptsPage";
import StockTakePage from "./features/inventory/StockTakePage";
import OrdersPage from "./features/orders/OrdersPage";
import OnlineOrdersPage from "./features/online-orders/OnlineOrdersPage";
import CustomersPage from "./features/customers/CustomersPage";
import AccountsPage from "./features/accounts/AccountsPage";
import LabelsPage from "./features/products/LabelsPage";
import PromotionsPage from "./features/promotions/PromotionsPage";

/**
 * Chặn theo vai ngay ở tầng route.
 *
 * Trước đây chỉ Tổng quan / Báo cáo / Cấu hình được chặn, nên thu ngân vẫn mở
 * được Nhập hàng hay Kiểm kê rồi nhận 403 từ backend mà màn hình không nói gì.
 */
function Guard({ roles, children }: { roles?: string[]; children: React.ReactNode }) {
  const { user, access } = useAuth();
  if (!user || !access) return <Navigate to="/dang-nhap" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

const KHO = ["ADMIN", "STOCKER"];
const QUAY = ["ADMIN", "CASHIER"];
const CA_BA = ["ADMIN", "CASHIER", "STOCKER"];

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/p/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<MyOrdersPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/dang-nhap" element={<ShopAuthPage />} />
      </Route>
      {/* Đăng nhập nhân viên đã gộp vào /dang-nhap; giữ đường cũ cho link đã lưu */}
      <Route path="/admin/login" element={<Navigate to="/dang-nhap" replace />} />
      <Route path="/pos" element={<Guard roles={QUAY}><PosPage /></Guard>} />
      <Route path="/scan" element={<ScannerPage />} />
      <Route path="/demo/bank" element={<BankDemo />} />
      <Route path="/admin" element={<Guard><AdminLayout /></Guard>}>
        <Route index element={<Guard roles={["ADMIN"]}><Dashboard /></Guard>} />
        <Route path="products" element={<Guard roles={KHO}><ProductsPage /></Guard>} />
        <Route path="labels" element={<Guard roles={KHO}><LabelsPage /></Guard>} />
        <Route path="inventory" element={<Guard roles={CA_BA}><InventoryPage /></Guard>} />
        <Route path="receipts" element={<Guard roles={KHO}><ReceiptsPage /></Guard>} />
        <Route path="stocktake" element={<Guard roles={KHO}><StockTakePage /></Guard>} />
        <Route path="orders" element={<Guard roles={QUAY}><OrdersPage /></Guard>} />
        <Route path="online" element={<Guard roles={CA_BA}><OnlineOrdersPage /></Guard>} />
        <Route path="customers" element={<Guard roles={QUAY}><CustomersPage /></Guard>} />
        <Route path="promotions" element={<Guard roles={["ADMIN"]}><PromotionsPage /></Guard>} />
        {/* Báo cáo giờ là cửa sổ nổi trên Tổng quan */}
        <Route path="reports" element={<Navigate to="/admin?report=1" replace />} />
        <Route path="accounts" element={<Guard roles={["ADMIN"]}><AccountsPage /></Guard>} />
        {/* Cấu hình đã bỏ: ngân hàng mở bằng nút cạnh Đăng xuất */}
        <Route path="settings" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
