/** Trang mặc định của từng vai sau khi đăng nhập hoặc khi vào chỗ không có quyền. */
export function homeFor(role?: string | null) {
  if (role === "CASHIER") return "/pos";
  if (role === "STOCKER") return "/admin/inventory";
  return "/admin";
}
