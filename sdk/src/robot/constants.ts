/** WebRTC data channel message types */
export const DataChannelType = {
  VALIDATION: "validation",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
  MSG: "msg",
  REQUEST: "req",
  RESPONSE: "res",
  VID: "vid",
  AUD: "aud",
  ERR: "err",
  HEARTBEAT: "heartbeat",
  RTC_INNER_REQ: "rtc_inner_req",
} as const;

/**
 * Robot DDS topics accessible via WebRTC. Rates observed on a Go2 Pro on
 * firmware 1.1.15: `LF_SPORT_MOD_STATE` ~20 Hz, `ROBOT_POSE` ~19 Hz,
 * `LOW_STATE` ~1 Hz (joint `q` only, no `dq`), `SPORT_MOD_STATE` silent.
 */
export const RtcTopic = {
  SPORT_REQUEST: "rt/api/sport/request",
  SPORT_RESPONSE: "rt/api/sport/response",
  SPORT_MOD_STATE: "rt/sportmodestate",
  LF_SPORT_MOD_STATE: "rt/lf/sportmodestate",
  LOW_STATE: "rt/lf/lowstate",
  /** Odometry pose from the LiDAR unit */
  ROBOT_POSE: "rt/utlidar/robot_pose",
  MULTIPLE_STATE: "rt/multiplestate",
  MOTION_SWITCHER_REQUEST: "rt/api/motion_switcher/request",
  MOTION_SWITCHER_RESPONSE: "rt/api/motion_switcher/response",
  VUI_REQUEST: "rt/api/vui/request",
  VUI_RESPONSE: "rt/api/vui/response",
  OBSTACLES_AVOID: "rt/api/obstacles_avoid/request",
  AUDIO_HUB_REQ: "rt/api/audiohub/request",
  LIDAR: "rt/utlidar/voxel_map",
  LIDAR_COMPRESSED: "rt/utlidar/voxel_map_compressed",
} as const;

/** Validation key prefix for challenge-response */
export const VALIDATION_PREFIX = "UnitreeGo2_";

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 2000;

/** AES-GCM key for firmware >=1.1.8 con_notify decryption */
export const CON_NOTIFY_AES_KEY = new Uint8Array([
  232, 86, 130, 189, 22, 84, 155, 0, 142, 4, 166, 104, 43, 179, 235, 227,
]);
