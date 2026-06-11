import type { Theme } from "../types";

export const atlasDefault: Theme = {
  id: "atlas-default",
  name: "Atlas Default",
  description: "The default Atlas look — clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: {
      colors: {
        background: "#ffffff",
        foreground: "#18181b",
        primary: "#06B6D4",
        muted: "#e4e4e7",
      },
    },
    dark: {
      colors: {
        background: "#0d0d0d",
        foreground: "#ffffff",
        primary: "#06B6D4",
        muted: "#1f1f1f",
      },
    },
  },
};
