import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Without these the app builds fine but shows a blank page ("supabaseUrl is required").
  if (command === "build") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Build stopped: ${missing.join(", ")} not set (.env or the host's build environment).`);
  }
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        external: ["capacitor-sms-inbox"],
      },
    },
  };
});
