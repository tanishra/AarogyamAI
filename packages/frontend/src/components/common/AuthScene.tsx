'use client';

import clsx from 'clsx';
import React from 'react';

interface AuthSceneProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  sideKicker?: string;
  sideTitle?: string;
  sideText?: string;
  sideImageSrc?: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthScene({
  title,
  subtitle,
  icon,
  sideKicker = 'Clinical Intelligence Platform',
  sideTitle = 'Precision workflows for modern care teams',
  sideText = 'Secure intake, nurse triage, and physician review in one cohesive system.',
  sideImageSrc,
  children,
  className,
}: AuthSceneProps) {
  void sideImageSrc;

  return (
    <div className={clsx('relative min-h-screen overflow-hidden bg-[#f7f4ef] px-4 py-6 sm:px-6 lg:px-8', className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 -top-20 h-80 w-80 rounded-full bg-[#bfd9ff]/50 blur-3xl" />
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#f9cf98]/45 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#c5f0e8]/40 blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-12">
        <aside className="relative hidden min-h-[620px] overflow-hidden rounded-[30px] border border-white/55 bg-gradient-to-br from-[#11396a] via-[#1b4f8f] to-[#0f8f87] p-8 text-white shadow-2xl shadow-blue-900/30 lg:col-span-5 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl animate-float-slow" />
            <div className="absolute -right-20 bottom-14 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl animate-float-medium" />
          </div>

          <div className="relative z-10">
            <p className="inline-flex rounded-full border border-white/35 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              {sideKicker}
            </p>
            <h2 className="mt-5 text-4xl font-semibold leading-tight text-white">{sideTitle}</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cyan-100/90">{sideText}</p>
          </div>

          <div className="relative z-10 mt-8 rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/90">Platform Highlights</p>
            <div className="mt-4 space-y-3">
              {[
                ['AI-first intake', 'Guided prompts for faster triage'],
                ['Role-safe access', 'Built-in security + audit boundaries'],
                ['Live operations', 'Queue and response signals in real time'],
              ].map(([titleText, detail], idx) => (
                <div
                  key={titleText}
                  className={clsx(
                    'rounded-2xl border border-white/15 bg-white/10 px-4 py-3 transition-all duration-300 hover:scale-[1.02] hover:bg-white/15 animate-fade-up',
                    idx === 1 ? 'delay-1' : idx === 2 ? 'delay-2' : ''
                  )}
                >
                  <p className="text-sm font-semibold text-white">{titleText}</p>
                  <p className="mt-1 text-xs text-cyan-100/90">{detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['HIPAA Ready', 'Realtime AI', 'Clinical Trace', 'Secure Consent'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-cyan-100/30 bg-cyan-50/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-cyan-50 animate-soft-pulse"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-7">
          <div className="ui-surface relative mx-auto w-full max-w-xl overflow-hidden rounded-[30px] p-6 sm:p-8 animate-fade-up">
            <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-blue-100/50 blur-2xl" />
            <div className="mb-5 rounded-2xl border border-[#c7dff8] bg-gradient-to-r from-[#ecf5ff] via-[#f7fbff] to-[#ecfffb] p-4 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-800/75">Care System</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {['Fast Intake', 'Role Routing', 'Smart Alerts', 'Audit Trail'].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#bcd7f6] bg-white/85 px-3 py-1 text-xs font-semibold text-blue-800 transition-all duration-200 hover:scale-105 hover:bg-white"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mb-6">
              {icon ? (
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f6efe] to-[#13b8ab] text-white shadow-lg shadow-blue-500/30">
                  {icon}
                </div>
              ) : null}
              <h1 className="text-3xl font-semibold text-[#0f2340]">{title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
