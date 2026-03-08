"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function DoctorSessionPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const sessionId = params.get("session_id");
    router.replace(
      sessionId
        ? `/doctor/dashboard?session_id=${sessionId}`
        : "/doctor/dashboard"
    );
  }, [router, params]);

  return null;
}
