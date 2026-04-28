import React, { createContext, ReactNode, useContext, useMemo, useState } from "react";
import Toast from "@/components/Toast";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

type ToastContextValue = {
  showToast: (message: string, duration?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useContext(SafeAreaInsetsContext);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    duration: number;
  }>({ visible: false, message: "", duration: 3000 });

  const value = useMemo(
    () => ({
      showToast: (message: string, duration = 3000) => {
        setToast({ visible: true, message, duration });
      },
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast
        visible={toast.visible}
        message={toast.message}
        duration={toast.duration}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        style={{ bottom: (insets?.bottom ?? 20) + 24, top: undefined }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
