/** Chỉ giữ chữ số — SĐT, PIN, số tài khoản. */
export const digitsOnly = (s: string) => s.replace(/\D/g, "");

export const VN_PHONE = /^0\d{9}$/;
export const isVnPhone = (s: string) => VN_PHONE.test(digitsOnly(s));

/** Mật khẩu: bỏ dấu tiếng Việt và khoảng trắng. */
export function asciiPassword(s: string) {
  return s
    .normalize("NFD")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s/g, "");
}

export function passwordError(s: string): string | null {
  if (!s) return "Nhập mật khẩu";
  if (s.length < 6) return "Mật khẩu từ 6 ký tự";
  if (/\s/.test(s)) return "Mật khẩu không có khoảng trắng";
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s)) {
    return "Mật khẩu không viết dấu";
  }
  return null;
}
