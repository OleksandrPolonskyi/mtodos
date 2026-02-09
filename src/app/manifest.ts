import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moddyland Canvas Task Manager",
    short_name: "Moddyland Tasks",
    description: "Canvas-менеджер задач для онлайн-магазину",
    start_url: "/",
    display: "standalone",
    background_color: "#f4fcff",
    theme_color: "#0284c7",
    lang: "uk-UA",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
