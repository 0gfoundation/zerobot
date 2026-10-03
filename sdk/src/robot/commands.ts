import { DataChannelType, RtcTopic } from "./constants.js";
import type { SportCommand } from "../types/commands.js";

/**
 * Generate a unique message ID (matches Python: timestamp_ms % 2^31 + random).
 */
export function generateMessageId(): number {
  return (Date.now() % 2147483648) + Math.floor(Math.random() * 1000);
}

/**
 * Build a sport command message for the WebRTC data channel.
 *
 * The robot expects the `parameter` field to be a JSON string (double-serialized),
 * not a nested object.
 */
export function buildSportCommandMessage(
  apiId: SportCommand,
  parameters?: Record<string, unknown>,
  id = generateMessageId(),
): string {
  return JSON.stringify({
    type: DataChannelType.REQUEST,
    topic: RtcTopic.SPORT_REQUEST,
    data: {
      header: {
        identity: {
          id,
          api_id: apiId,
        },
      },
      parameter: parameters ? JSON.stringify(parameters) : "",
    },
  });
}

/**
 * Build a VUI command message (LED color, volume, brightness).
 */
export function buildVuiCommandMessage(
  apiId: number,
  parameters?: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: DataChannelType.REQUEST,
    topic: RtcTopic.VUI_REQUEST,
    data: {
      header: {
        identity: {
          id: generateMessageId(),
          api_id: apiId,
        },
      },
      parameter: parameters ? JSON.stringify(parameters) : "",
    },
  });
}

/**
 * Build a motion switcher command message.
 */
export function buildMotionSwitcherMessage(
  apiId: number,
  parameters?: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: DataChannelType.REQUEST,
    topic: RtcTopic.MOTION_SWITCHER_REQUEST,
    data: {
      header: {
        identity: {
          id: generateMessageId(),
          api_id: apiId,
        },
      },
      parameter: parameters ? JSON.stringify(parameters) : "",
    },
  });
}

/**
 * Build a subscribe message for a topic.
 */
export function buildSubscribeMessage(topic: string): string {
  return JSON.stringify({
    type: DataChannelType.SUBSCRIBE,
    topic,
  });
}

/**
 * Build an unsubscribe message for a topic.
 */
export function buildUnsubscribeMessage(topic: string): string {
  return JSON.stringify({
    type: DataChannelType.UNSUBSCRIBE,
    topic,
  });
}

/**
 * Build a video channel toggle message.
 */
export function buildVideoToggleMessage(on: boolean): string {
  return JSON.stringify({
    type: DataChannelType.VID,
    topic: "",
    data: on ? "on" : "off",
  });
}

/**
 * Build an audio channel toggle message.
 */
export function buildAudioToggleMessage(on: boolean): string {
  return JSON.stringify({
    type: DataChannelType.AUD,
    topic: "",
    data: on ? "on" : "off",
  });
}
