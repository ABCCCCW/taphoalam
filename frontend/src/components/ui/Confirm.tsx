import { createContext, useCallback, useContext, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

type Ask = {
  title: string;
  body?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

const ConfirmCtx = createContext<((ask: Ask) => Promise<boolean>) | null>(null);

/**
 * Hỏi xác nhận bằng modal thay cho `window.confirm()`.
 * Hộp của trình duyệt không nói được hậu quả (vd. cân bằng kho lệch bao nhiêu
 * món), lại chặn toàn bộ tab trong lúc chờ.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((next: Ask) => {
    setAsk(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setAsk(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {ask && (
        <Modal
          size="sm"
          title={ask.title}
          onClose={() => settle(false)}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => settle(false)}>
                {ask.cancelText || "Huỷ"}
              </Button>
              <Button className="flex-1" variant={ask.danger ? "coral" : "lime"} onClick={() => settle(true)}>
                {ask.confirmText || "Lưu"}
              </Button>
            </>
          }
        >
          <div className="text-sm leading-relaxed text-ink-600">{ask.body}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm cần ConfirmProvider ở trên cây component");
  return ctx;
}
