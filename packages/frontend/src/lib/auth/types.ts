export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO' | null;
  isAuthenticated: boolean;
  sessionExpiresAt: Date | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: string;
}

export interface RefreshResponse {
  token: string;
  expiresAt: string;
}
