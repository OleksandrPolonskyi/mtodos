import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
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
            "linear-gradient(140deg, rgb(2, 132, 199) 0%, rgb(14, 165, 233) 65%, rgb(249, 115, 22) 100%)",
          borderRadius: 40,
          color: "white",
          fontWeight: 800,
          fontSize: 86
        }}
      >
        M
      </div>
    ),
    {
      ...size
    }
  );
}
