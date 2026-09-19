import { NavLink } from "react-router-dom";
import { useAuth } from "../../stores/authStore";
import { TAB_BAR, tabClass } from "../../components/ui/Page";

/** Tồn kho và Kiểm kê là hai tab của một mục «Kho». Thu ngân chỉ xem tồn kho nên không có tab. */
const TABS = [
  { to: "/admin/inventory", label: "Tồn kho", roles: ["ADMIN", "STOCKER", "CASHIER"] },
  { to: "/admin/stocktake", label: "Kiểm kê", roles: ["ADMIN", "STOCKER"] },
];

export default function KhoTabs() {
  const { user } = useAuth();
  const tabs = TABS.filter((t) => user && t.roles.includes(user.role));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Kho" className={TAB_BAR}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => tabClass(isActive)}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
