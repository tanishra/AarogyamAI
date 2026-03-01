"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope,
  ClipboardList,
  User,
  Lock,
  ArrowRight,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react";
import { createDevBearerToken } from "@/lib/auth";
import { sendPatientOTP, verifyPatientOTP } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Role = "doctor" | "nurse" | "patient";

const roles = [
  {
    id: "doctor" as Role,
    label: "Doctor",
    sub: "Specialist Portal",
    icon: Stethoscope,
    activeStyle: { border: "2px solid #2563EB", background: "#EFF6FF" },
    iconActiveStyle: { background: "#DBEAFE", color: "#2563EB" },
    dot: "#2563EB",
  },
  {
    id: "nurse" as Role,
    label: "Nurse",
    sub: "Care Provider",
    icon: ClipboardList,
    activeStyle: { border: "2px solid #4F46E5", background: "#EEF2FF" },
    iconActiveStyle: { background: "#E0E7FF", color: "#4F46E5" },
    dot: "#4F46E5",
  },
  {
    id: "patient" as Role,
    label: "Patient",
    sub: "My Health Record",
    icon: User,
    activeStyle: { border: "2px solid #64748B", background: "#F8FAFC" },
    iconActiveStyle: { background: "#F1F5F9", color: "#475569" },
    dot: "#64748B",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [selectedRole, setSelectedRole] = useState<Role>("nurse");
  const [clinicalId, setClinicalId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState("");

  const handleLogin = async () => {
    if (selectedRole === "patient") {
      if (!clinicalId) {
        setError("Enter a valid phone number in +91XXXXXXXXXX format.");
        return;
      }
      if (!otpSent) {
        await handleSendOTP();
        return;
      }
      if (!passcode || passcode.length !== 6) {
        setError("Enter the 6-digit OTP.");
        return;
      }
      await handleVerifyOTP();
      return;
    }
    if (!clinicalId || !passcode) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    const userId =
      selectedRole === "patient" ? "patient-demo-001" : "staff-001";
    setSession({
      role: selectedRole,
      token: createDevBearerToken(selectedRole, userId),
      userId,
      clinicId: "clinic-demo-001",
    });
    if (selectedRole === "doctor") router.push("/doctor/differential");
    else if (selectedRole === "nurse") router.push("/nurse/dashboard");
    else router.push("/patient/portal");
  };

  const normalizePhone = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith("+")) return trimmed;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return trimmed;
  };

  const handleSendOTP = async () => {
    const phone = normalizePhone(clinicalId);
    setLoading(true);
    setError("");
    try {
      const sent = await sendPatientOTP(phone);
      setClinicalId(phone);
      setOtpSent(true);
      setOtpHint(
        sent.dev_otp
          ? `OTP sent. Dev OTP: ${sent.dev_otp}`
          : `OTP sent to ${sent.masked_phone}`
      );
    } catch (e) {
      setError(`Failed to send OTP: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const phone = normalizePhone(clinicalId);
    setLoading(true);
    setError("");
    try {
      const verified = await verifyPatientOTP({
        phone,
        otp: passcode.trim(),
        clinic_id: "clinic-demo-001",
      });
      setSession({
        role: "patient",
        token: verified.access_token,
        userId: verified.patient_id,
        clinicId: "clinic-demo-001",
      });
      router.push("/patient/portal");
    } catch (e) {
      setError(`OTP verification failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "13px 16px 13px 42px",
    borderRadius: "12px",
    border: "1.5px solid #E5E7EB",
    background: "#F8FAFC",
    fontSize: "14px",
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
    transition: "all 0.2s",
  };

  return (
    <div style={{
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
    }}>

      {/* Blobs */}
      <div style={{ position: "absolute", top: "-15%", right: "-8%", width: "500px", height: "500px", borderRadius: "50%", background: "rgba(219,234,254,0.7)", filter: "blur(100px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-10%", left: "-5%", width: "350px", height: "350px", borderRadius: "50%", background: "rgba(224,231,255,0.6)", filter: "blur(90px)", pointerEvents: "none" }} />

      {/* Navbar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardList size={16} color="white" />
          </div>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.3px" }}>AarogyamAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <a href="#" style={{ fontSize: "14px", color: "#64748B", textDecoration: "none" }}>Documentation</a>
          <a href="#" style={{ fontSize: "14px", color: "#64748B", textDecoration: "none" }}>Support</a>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#374151", background: "white", border: "1px solid #E5E7EB", borderRadius: "99px", padding: "6px 14px" }}>
            <Shield size={13} color="#10B981" />
            Secure Gateway
          </div>
        </div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "relative", zIndex: 10,
          width: "100%", maxWidth: "480px",
          background: "white",
          borderRadius: "20px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.1)",
          border: "1px solid #E5E7EB",
          padding: "40px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#2563EB" }}>
            Stage 1: Access Layer
          </span>
          <h1 style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
            Unified Role-Based Login
          </h1>
          <p style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280", lineHeight: 1.5 }}>
            Select your clinical workspace to begin the workflow.
          </p>
        </div>

        {/* Role Selector */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "28px" }}>
          {roles.map((role) => {
            const Icon = role.icon;
            const isActive = selectedRole === role.id;
            return (
              <motion.button
                key={role.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setSelectedRole(role.id);
                  setError("");
                  setOtpSent(false);
                  setPasscode("");
                  setOtpHint("");
                }}
                style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: "10px", padding: "20px 12px", borderRadius: "14px",
                  cursor: "pointer", transition: "all 0.2s ease",
                  border: isActive ? role.activeStyle.border : "2px solid #E5E7EB",
                  background: isActive ? role.activeStyle.background : "white",
                  outline: "none",
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isActive ? role.iconActiveStyle.background : "#F1F5F9",
                  transition: "all 0.2s ease",
                }}>
                  <Icon size={19} color={isActive ? role.iconActiveStyle.color : "#94A3B8"} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: isActive ? "#0F172A" : "#64748B", margin: 0 }}>{role.label}</p>
                  <p style={{ fontSize: "11px", color: "#94A3B8", margin: "2px 0 0 0" }}>{role.sub}</p>
                </div>
                {isActive && (
                  <div style={{ position: "absolute", top: "10px", right: "10px", width: "8px", height: "8px", borderRadius: "50%", background: role.dot }} />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

          {/* Clinical ID */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#374151", marginBottom: "8px" }}>
              {selectedRole === "patient" ? "Phone Number" : "Clinical ID"}
            </label>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", display: "flex" }}>
                <ClipboardList size={16} />
              </div>
              <input
                type="text"
                placeholder={
                  selectedRole === "patient"
                    ? "+919876543210"
                    : "Enter your ID or Email"
                }
                value={clinicalId}
                onChange={(e) => setClinicalId(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "#2563EB"; e.target.style.background = "white"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.background = "#F8FAFC"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* Passcode */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#374151" }}>
                {selectedRole === "patient" ? "OTP" : "Passcode"}
              </label>
              {selectedRole !== "patient" && (
                <a href="#" style={{ fontSize: "12px", color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>Reset access</a>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", display: "flex" }}>
                <Lock size={16} />
              </div>
              <input
                type={
                  selectedRole === "patient"
                    ? "text"
                    : showPass
                    ? "text"
                    : "password"
                }
                placeholder={selectedRole === "patient" ? "Enter 6-digit OTP" : "••••••••"}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                style={{ ...inputStyle, paddingRight: "44px" }}
                onFocus={(e) => { e.target.style.borderColor = "#2563EB"; e.target.style.background = "white"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E5E7EB"; e.target.style.background = "#F8FAFC"; e.target.style.boxShadow = "none"; }}
              />
              {selectedRole !== "patient" && (
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex", padding: 0 }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>

          {selectedRole === "patient" && otpHint && (
            <p style={{ fontSize: "12px", color: "#2563EB", fontWeight: 600, margin: "-6px 0" }}>
              {otpHint}
            </p>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ fontSize: "12px", color: "#EF4444", fontWeight: 600, margin: "-6px 0" }}>
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: loading ? "#93C5FD" : "#2563EB",
              color: "white", fontWeight: 700, fontSize: "15px",
              padding: "14px", borderRadius: "12px", border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
              fontFamily: "inherit", marginTop: "4px",
              transition: "background 0.2s",
            }}
          >
            {loading ? (
              <div style={{ width: "18px", height: "18px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            ) : (
              <>
                <span>
                  {selectedRole === "patient"
                    ? otpSent
                      ? "Verify OTP"
                      : "Send OTP"
                    : "Initialize Session"}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        style={{ position: "relative", zIndex: 10, marginTop: "24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "12px", color: "#6B7280", fontWeight: 500 }}>
          <Shield size={13} color="#10B981" />
          Secure Medical Gateway • ISO 27001 Certified
        </div>
        <p style={{ marginTop: "4px", fontSize: "11px", color: "#9CA3AF" }}>
          © 2024 AarogyamAI Healthcare Systems. Enterprise Clinical Workflow Management.
        </p>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
