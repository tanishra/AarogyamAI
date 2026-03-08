'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AnimatedButton, AuthScene } from '@/components/common';

type AuthTab = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'Patient',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const routeByRole = (role: string) => {
    if (role === 'Patient') return '/patient/dashboard';
    if (role === 'Nurse') return '/nurse/dashboard';
    if (role === 'Doctor') return '/doctor/dashboard';
    return '/dashboard';
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ email: formData.email, password: formData.password });
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr) as { role: string };
        router.push(routeByRole(user.role));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Signup failed');

      localStorage.setItem('token', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));

      router.push(routeByRole(formData.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScene
      title="Welcome to Clinical Zen"
      subtitle="Modern AI-assisted care intake with secure, role-based workflows"
      sideTitle="Nurse intake and vitals workflow in one view"
      sideText="Capture triage context, monitor patient queue, and move cases forward with confidence."
      icon={
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      }
    >
      <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => setActiveTab('signin')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setActiveTab('signup')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Sign Up
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {activeTab === 'signin' ? (
        <form onSubmit={handleSignIn} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="Enter password"
            />
          </label>

          <AnimatedButton type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </AnimatedButton>

          <div className="flex items-center justify-between text-sm">
            <Link href="/reset-password" className="font-medium text-blue-600 hover:text-blue-700">
              Forgot password?
            </Link>
            <Link href="/mfa-verify" className="font-medium text-slate-600 hover:text-slate-800">
              MFA verify
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</span>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="John Doe"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</span>
            <select
              value={formData.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
            >
              <option value="Patient">Patient</option>
              <option value="Nurse">Nurse</option>
              <option value="Doctor">Doctor</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="Minimum 8 characters"
            />
          </label>

          <AnimatedButton type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </AnimatedButton>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-slate-500">
        Secure-by-design workflows inspired by modern UI patterns from 21st.dev ecosystems.
      </p>
    </AuthScene>
  );
}
