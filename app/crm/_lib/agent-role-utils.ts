export const isAdminRole = (role: string | null | undefined) => {
  const normalizedRole = (role || "").trim().toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "administrador";
};
