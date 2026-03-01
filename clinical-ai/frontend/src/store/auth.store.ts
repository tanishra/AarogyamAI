import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "patient" | "nurse" | "doctor" | "admin";

type AuthState = {
  role: UserRole | null;
  token: string | null;
  userId: string | null;
  clinicId: string;
  setSession: (payload: {
    role: UserRole;
    token: string;
    userId: string;
    clinicId?: string;
  }) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      token: null,
      userId: null,
      clinicId: "clinic-demo-001",
      setSession: ({ role, token, userId, clinicId }) =>
        set({
          role,
          token,
          userId,
          clinicId: clinicId ?? "clinic-demo-001",
        }),
      clearSession: () =>
        set({
          role: null,
          token: null,
          userId: null,
          clinicId: "clinic-demo-001",
        }),
    }),
    {
      name: "aarogyamai-auth",
    }
  )
);
