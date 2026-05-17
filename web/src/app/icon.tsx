import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
            width: 22,
            height: 22,
          }}
        >
          <div
            style={{
              width: 9,
              height: 11,
              marginBottom: -2,
              background: "#9a7b5c",
              borderRadius: "50% 50% 50% 0",
              transform: "rotate(-45deg)",
            }}
          />
          <div
            style={{
              width: 18,
              height: 9,
              border: "2.5px solid #2a2622",
              borderTop: "none",
              borderRadius: "0 0 10px 10px",
              background: "rgba(154, 123, 92, 0.18)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
