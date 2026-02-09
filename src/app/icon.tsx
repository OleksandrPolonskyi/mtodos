import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, rgb(2, 132, 199) 0%, rgb(14, 165, 233) 60%, rgb(249, 115, 22) 100%)"
        }}
      >
        <div
          style={{
            width: 290,
            height: 290,
            borderRadius: 42,
            background: "rgba(255,255,255,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgb(3, 105, 161)",
            fontSize: 148,
            fontWeight: 800
          }}
        >
          M
        </div>
      </div>
    ),
    {
      ...size
    }
  );
}
