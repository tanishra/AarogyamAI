"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Stethoscope, User, ArrowRight, Shield } from "lucide-react";

type Role = "patient" | "nurse" | "doctor";

type FormState = {
  fullName: string;
  clinicId: string;
  phone: string;
  personalEmail: string;
  city: string;
  age: string;
  licenseOrEmployeeId: string;
  specialty: string;
  preferredHandle: string;
};

type SignupRequest = {
  id: string;
  role: Role;
  created_at: string;
  payload: FormState;
  proposed_work_email: string | null;
};

const roles: Array<{
  id: Role;
  label: string;
  sub: string;
  icon: typeof User;
  activeStyle: { border: string; background: string };
  iconActiveStyle: { background: string; color: string };
  dot: string;
}> = [
  {
    id: "patient",
    label: "Patient",
    sub: "Health Access",
    icon: User,
    activeStyle: { border: "2px solid #64748B", background: "#F8FAFC" },
    iconActiveStyle: { background: "#F1F5F9", color: "#475569" },
    dot: "#64748B",
  },
  {
    id: "nurse",
    label: "Nurse",
    sub: "Care Provider",
    icon: ClipboardList,
    activeStyle: { border: "2px solid #4F46E5", background: "#EEF2FF" },
    iconActiveStyle: { background: "#E0E7FF", color: "#4F46E5" },
    dot: "#4F46E5",
  },
  {
    id: "doctor",
    label: "Doctor",
    sub: "Specialist",
    icon: Stethoscope,
    activeStyle: { border: "2px solid #2563EB", background: "#EFF6FF" },
    iconActiveStyle: { background: "#DBEAFE", color: "#2563EB" },
    dot: "#2563EB",
  },
];

const initialForm: FormState = {
  fullName: "",
  clinicId: "clinic-demo-001",
  phone: "",
  personalEmail: "",
  city: "",
  age: "",
  licenseOrEmployeeId: "",
  specialty: "",
  preferredHandle: "",
};

export default function SignupPage() {
  const [role, setRole] = useState<Role>("patient");
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());

  const normalizePhone = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith("+")) return trimmed;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return trimmed;
  };

  const workEmailPreview = useMemo(() => {
    const handle = (form.preferredHandle || form.fullName || "staff.user")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 32);
    const clinic = form.clinicId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    return `${handle || "staff.user"}@${clinic || "clinic"}.aarogyamai.health`;
  }, [form.preferredHandle, form.fullName, form.clinicId]);

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError("");
    setSubmitted(false);

    if (!form.fullName.trim()) {
      setError("Please enter full name.");
      return;
    }
    if (!form.clinicId.trim()) {
      setError("Please enter clinic ID.");
      return;
    }

    if (role === "patient") {
      const phone = normalizePhone(form.phone);
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        setError("Enter valid phone in +91XXXXXXXXXX format.");
        return;
      }
      setField("phone", phone);
    } else {
      if (!isValidEmail(form.personalEmail)) {
        setError("Enter a valid personal email.");
        return;
      }
      if (!form.licenseOrEmployeeId.trim()) {
        setError(role === "doctor" ? "Enter medical license number." : "Enter employee ID.");
        return;
      }
      if (role === "doctor" && !form.specialty.trim()) {
        setError("Enter your specialty.");
        return;
      }
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    if (typeof window !== "undefined") {
      const key = "aarogyamai-signup-requests";
      const existingRaw = window.localStorage.getItem(key);
      let existing: SignupRequest[] = [];
      try {
        existing = existingRaw ? (JSON.parse(existingRaw) as SignupRequest[]) : [];
      } catch {
        existing = [];
      }
      const record: SignupRequest = {
        id: `req-${Date.now()}`,
        role,
        created_at: new Date().toISOString(),
        payload: form,
        proposed_work_email: role === "patient" ? null : workEmailPreview,
      };
      window.localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 100)));
    }
    setSubmitted(true);
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1.5px solid #E5E7EB",
    background: "#F8FAFC",
    fontSize: "14px",
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #EEF2FF 0%, #F0F4F8 50%, #EFF6FF 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-15%",
          right: "-8%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "rgba(219,234,254,0.7)",
          filter: "blur(100px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          left: "-5%",
          width: "350px",
          height: "350px",
          borderRadius: "50%",
          background: "rgba(224,231,255,0.6)",
          filter: "blur(90px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 40px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "#2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ClipboardList size={16} color="white" />
          </div>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A" }}>AarogyamAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <Link href="/login" style={{ fontSize: "14px", color: "#2563EB", textDecoration: "none", fontWeight: 700 }}>
            Back to Login
          </Link>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#374151",
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "99px",
              padding: "6px 14px",
            }}
          >
            <Shield size={13} color="#10B981" />
            Secure Enrollment
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "640px",
          background: "white",
          borderRadius: "20px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.1)",
          border: "1px solid #E5E7EB",
          padding: "30px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#2563EB",
            }}
          >
            Clinical Zen Access
          </span>
          <h1 style={{ marginTop: "8px", fontSize: "26px", fontWeight: 800, color: "#0F172A", lineHeight: 1.2 }}>
            Unified Sign-Up
          </h1>
          <p style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280" }}>
            Create access request for Patient, Nurse, or Doctor.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "22px" }}>
          {roles.map((item) => {
            const Icon = item.icon;
            const active = role === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setRole(item.id);
                  setError("");
                  setSubmitted(false);
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "9px",
                  padding: "16px 8px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  border: active ? item.activeStyle.border : "2px solid #E5E7EB",
                  background: active ? item.activeStyle.background : "white",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? item.iconActiveStyle.background : "#F1F5F9",
                  }}
                >
                  <Icon size={17} color={active ? item.iconActiveStyle.color : "#94A3B8"} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: active ? "#0F172A" : "#64748B", margin: 0 }}>{item.label}</p>
                  <p style={{ fontSize: "11px", color: "#94A3B8", margin: 0 }}>{item.sub}</p>
                </div>
                {active && (
                  <div
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: item.dot,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <input
            type="text"
            placeholder="Full Name"
            value={form.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Clinic ID"
            value={form.clinicId}
            onChange={(e) => setField("clinicId", e.target.value)}
            style={inputStyle}
          />

          {role === "patient" ? (
            <>
              <input
                type="text"
                placeholder="Phone (+91XXXXXXXXXX)"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="City"
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                style={inputStyle}
              />
              <input
                type="number"
                placeholder="Age"
                value={form.age}
                onChange={(e) => setField("age", e.target.value)}
                style={{ ...inputStyle, gridColumn: "1 / span 2" }}
              />
            </>
          ) : (
            <>
              <input
                type="email"
                placeholder="Personal Email"
                value={form.personalEmail}
                onChange={(e) => setField("personalEmail", e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder={role === "doctor" ? "Medical License No." : "Employee ID"}
                value={form.licenseOrEmployeeId}
                onChange={(e) => setField("licenseOrEmployeeId", e.target.value)}
                style={inputStyle}
              />
              {role === "doctor" && (
                <input
                  type="text"
                  placeholder="Specialty"
                  value={form.specialty}
                  onChange={(e) => setField("specialty", e.target.value)}
                  style={{ ...inputStyle, gridColumn: "1 / span 2" }}
                />
              )}
              <input
                type="text"
                placeholder="Preferred Work Email Handle (optional)"
                value={form.preferredHandle}
                onChange={(e) => setField("preferredHandle", e.target.value)}
                style={{ ...inputStyle, gridColumn: "1 / span 2" }}
              />
              <div
                style={{
                  gridColumn: "1 / span 2",
                  borderRadius: "12px",
                  border: "1px solid #DBEAFE",
                  background: "#F8FAFF",
                  color: "#1E40AF",
                  fontSize: "12px",
                  padding: "10px 12px",
                  fontWeight: 600,
                }}
              >
                Proposed work email: {workEmailPreview}
              </div>
            </>
          )}
        </div>

        {error && (
          <p style={{ marginTop: "12px", fontSize: "12px", color: "#EF4444", fontWeight: 600 }}>{error}</p>
        )}

        {submitted && (
          <div
            style={{
              marginTop: "12px",
              borderRadius: "12px",
              border: "1px solid #BBF7D0",
              background: "#F0FDF4",
              padding: "12px",
              fontSize: "13px",
              color: "#166534",
              fontWeight: 600,
            }}
          >
            {role === "patient"
              ? "Patient sign-up submitted. Use your phone OTP on login to continue."
              : "Staff sign-up submitted. Clinic admin will verify and issue/activate your work email for OTP login."}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{
            marginTop: "16px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: loading ? "#93C5FD" : "#2563EB",
            color: "white",
            fontWeight: 700,
            fontSize: "15px",
            padding: "13px",
            borderRadius: "12px",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
            transition: "background 0.2s",
          }}
        >
          <span>{loading ? "Submitting..." : "Submit Sign-Up"}</span>
          <ArrowRight size={16} />
        </button>

        <p style={{ marginTop: "12px", fontSize: "12px", color: "#64748B", textAlign: "center" }}>
          Already onboarded?{" "}
          <Link href="/login" style={{ color: "#2563EB", fontWeight: 700, textDecoration: "none" }}>
            Go to Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
