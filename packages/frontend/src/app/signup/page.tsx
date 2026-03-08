'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatedButton, AuthScene } from '@/components/common';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Patient',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

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

      if (formData.role === 'Patient') router.push('/patient/dashboard');
      else if (formData.role === 'Nurse') router.push('/nurse/dashboard');
      else if (formData.role === 'Doctor') router.push('/doctor/dashboard');
      else router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScene
      title="Create your account"
      subtitle="Join the clinical workflow network in under one minute"
      icon={
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      }
      sideTitle="Built for care teams, not generic forms"
      sideText="Fast onboarding with strong security defaults and role-aware routing."
    >
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">I am a</span>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="Min 8 chars"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm</span>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm transition-all hover:border-slate-400"
              placeholder="Re-enter"
            />
          </label>
        </div>

        <AnimatedButton type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Create Account'}
        </AnimatedButton>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </AuthScene>
  );
}
