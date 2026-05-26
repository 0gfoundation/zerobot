// The dashboard is wallet-gated and JS-driven (Wagmi, WebRTC, signer-bound chain
// reads). Server rendering would just ship a misleading "Connect your wallet"
// frame for users whose wallet state lives in localStorage. Disabling SSR lets
// the client-side cache snapshot pick the correct initial branch.
export const ssr = false;
