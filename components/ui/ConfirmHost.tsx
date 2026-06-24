import { useEffect, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { confirmStore } from "./confirm-store";

export const ConfirmHost = () => {
  const [pending, setPending] = useState(confirmStore.getPending());

  useEffect(() => confirmStore.subscribe(() => setPending(confirmStore.getPending())), []);

  if (!pending) return null;

  return (
    <ConfirmModal
      open
      title={pending.title}
      message={pending.message}
      step={pending.step}
      showAutoApply={pending.showAutoApply}
      onConfirm={(autoApply) => confirmStore.respond({ confirmed: true, autoApply })}
      onCancel={() => confirmStore.cancel()}
    />
  );
};
