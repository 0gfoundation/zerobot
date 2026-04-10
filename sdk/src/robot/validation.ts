import { computeValidationResponse } from "./crypto.js";
import { DataChannelType } from "./constants.js";

export interface ValidationResult {
  success: boolean;
  error?: string;
}

/**
 * Handle the WebRTC data channel validation handshake.
 *
 * Protocol:
 * 1. Robot sends {type: "validation", data: "<challenge_key>"}
 * 2. Client responds with {type: "validation", data: base64(md5("UnitreeGo2_" + key))}
 * 3. Robot sends {type: "validation", data: "Validation Ok."}
 */
export function handleValidationMessage(
  message: { type: string; data: string },
  sendFn: (msg: string) => void,
): ValidationResult {
  if (message.type !== DataChannelType.VALIDATION) {
    return { success: false, error: "Not a validation message" };
  }

  if (message.data === "Validation Ok.") {
    return { success: true };
  }

  // Robot sent a challenge key — compute and send response
  const response = computeValidationResponse(message.data);
  sendFn(
    JSON.stringify({
      type: DataChannelType.VALIDATION,
      data: response,
    }),
  );

  return { success: false }; // Waiting for confirmation
}
