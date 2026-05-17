import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f3ed",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            width: 120,
            height: 120,
          }}
        >
          <div
            style={{
              width: 48,
              height: 58,
              marginBottom: -8,
              background: "#9a7b5c",
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
            }}
          />
          <div
            style={{
              width: 98,
              height: 48,
              border: "12px solid #2a2622",
              borderTop: "none",
              borderRadius: "0 0 56px 56px",
              background: "rgba(154, 123, 92, 0.22)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
